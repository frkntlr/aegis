import { WorktreeManager } from "./worktree-manager.js";
import { RoleClassifier } from "./role-classifier.js";
import type { GitHubIssue, GitHubClient } from "@aegis/github-live";

export interface ILoopBreaker {
	isBlocked(issueNumber: number): boolean;
	recordSuccess?(issueNumber: number): void;
	recordFailure(
		issueNumber: number,
		errorMessage: string,
	): {
		blocked: boolean;
		attempts: number;
		maxFailures: number;
		reason?: string;
	};
}

export interface DispatchResult {
	dispatched: boolean;
	agentName?: string;
	issue?: GitHubIssue;
	reason?: string;
}

export type SocraticDiagnosticCategory = "syntax" | "runtime" | "test failure" | "timeout";

export interface SocraticDiagnosis {
	hint: string;
	category: SocraticDiagnosticCategory;
	location?: string;
	headline: string;
}

export interface TaskFailureResult {
	blocked: boolean;
	reason?: string;
	diagnostic?: string;
	category?: SocraticDiagnosticCategory;
}

function isTimeoutError(lower: string): boolean {
	return (
		lower.includes("timeout") ||
		lower.includes("timed out") ||
		lower.includes("time out") ||
		lower.includes("etimedout") ||
		lower.includes("deadline exceeded")
	);
}

function isSyntaxError(lower: string): boolean {
	return (
		lower.includes("syntaxerror") ||
		lower.includes("unexpected token") ||
		lower.includes("parse error") ||
		lower.includes("cannot find name") ||
		/ts\d{4,5}:/.test(lower) ||
		lower.includes("compile error")
	);
}

function isRuntimeError(lower: string): boolean {
	return (
		lower.includes("typeerror") ||
		lower.includes("referenceerror") ||
		lower.includes("rangeerror") ||
		lower.includes("cannot read propert") ||
		lower.includes("is not a function") ||
		lower.includes("null pointer") ||
		lower.includes("unhandled rejection") ||
		lower.includes("uncaught exception") ||
		lower.includes("panic:") ||
		lower.includes("sigsegv") ||
		lower.includes("script error:")
	);
}

function isTestFailure(lower: string, original: string): boolean {
	return (
		lower.includes("assert") ||
		lower.includes("expect(") ||
		lower.includes("test failed") ||
		lower.includes("tests failed") ||
		lower.includes("test error") ||
		/\bfail(?:\s+\d+|\b)/i.test(original)
	);
}

export function categorizeError(error: string): SocraticDiagnosticCategory {
	const lower = error.toLowerCase();
	if (isTimeoutError(lower)) return "timeout";
	if (isSyntaxError(lower)) return "syntax";
	if (isRuntimeError(lower)) return "runtime";
	if (isTestFailure(lower, error)) return "test failure";
	return "runtime";
}

function extractLocation(error: string): string | null {
	const v8 = error.match(/(?:^|\s+)at\s+(?:([a-zA-Z0-9_$.<>]+)\s+\()?(?:file:\/\/\/)?([a-zA-Z]:[\\/][^()]+|[a-zA-Z0-9_./\\-]+):(\d+):(\d+)\)?/);
	if (v8) {
		const sym = v8[1] ? ` in ${v8[1].trim()}` : "";
		return `${v8[2].replace(/\\/g, "/")}:${v8[3]}:${v8[4]}${sym}`;
	}
	const godot = error.match(/At:\s+(res:\/\/[^:\s]+):(\d+)(?::([a-zA-Z0-9_]+))?/);
	if (godot) {
		const fn = godot[3] ? ` in ${godot[3]}` : "";
		return `${godot[1].replace(/^res:\/\//, "")}:${godot[2]}${fn}`;
	}
	const posix = error.match(/(?:^|\s)((?:[a-zA-Z]:[\\/][^\s:]+|[a-zA-Z0-9_./\\-]+)\.(?:ts|tsx|js|jsx|gd|py|rs|cs|cpp|c|h|go)):(\d+)(?::(\d+))?/);
	if (posix) {
		const col = posix[3] ? `:${posix[3]}` : "";
		return `${posix[1].replace(/\\/g, "/")}:${posix[2]}${col}`;
	}
	return null;
}

function extractHeadline(error: string): string {
	const cleaned = error.replace(/\u001b\[[0-9;]*m/g, "").replace(/\r\n/g, "\n");
	const line = cleaned.split("\n").map(l => l.trim()).find(l => l.length > 0) ?? error.trim();
	return line.length > 120 ? `${line.slice(0, 117)}...` : line;
}

export function formatSocraticDiagnosis(error: string): SocraticDiagnosis | null {
	if (!error || !error.trim()) return null;
	const category = categorizeError(error);
	const headline = extractHeadline(error);
	const location = extractLocation(error) ?? undefined;
	const locSuffix = location && !headline.includes(location) ? ` at ${location}` : "";
	const hint = `[Socratic Diagnosis] (${category}): ${headline}${locSuffix}`;
	return { hint, category, location, headline };
}

export class TaskDispatcher {
	private worktreeManager: WorktreeManager;
	private loopBreaker?: ILoopBreaker;
	private roleClassifier: RoleClassifier;

	constructor(
		worktreeManager?: WorktreeManager,
		loopBreaker?: ILoopBreaker,
		roleClassifier?: RoleClassifier,
	) {
		this.worktreeManager = worktreeManager ?? new WorktreeManager();
		this.loopBreaker = loopBreaker;
		this.roleClassifier = roleClassifier ?? new RoleClassifier();
	}

	private static normalizeRole(name: string): string {
		const clean = name.toLowerCase().replace(/^@/, "");
		if (clean.includes("solver")) return "solver";
		if (clean.includes("hunter") || clean.includes("qa")) return "qa";
		if (clean.includes("specialist") || clean.includes("ui")) return "ui";
		if (clean.includes("architect") || clean.includes("doc")) return "docs";
		return clean;
	}

	private static isRoleCompatible(agent: string, role: string): boolean {
		const normAgent = TaskDispatcher.normalizeRole(agent);
		const normRole = TaskDispatcher.normalizeRole(role);
		if (normAgent === normRole) return true;
		if (normAgent === "ui" && normRole === "qa") return true;
		if (normAgent === "qa" && normRole === "ui") return true;
		const specialized = ["solver", "qa", "docs", "ui"];
		return !specialized.includes(normAgent);
	}

	private tryDispatchIssue(
		issue: GitHubIssue,
		availableAgents: string[],
	): DispatchResult | null {
		const inference = this.roleClassifier.classify(issue);
		const eligibleAgent =
			availableAgents.find((a) => TaskDispatcher.normalizeRole(a) === inference.role) ??
			availableAgents.find((a) => TaskDispatcher.isRoleCompatible(a, inference.role));
		if (!eligibleAgent || this.worktreeManager.hasUnmergedConflicts(eligibleAgent)) {
			return null;
		}
		const lockAttempt = this.worktreeManager.acquireFileLocks(eligibleAgent, issue.targetFiles);
		return lockAttempt.success ? { dispatched: true, agentName: eligibleAgent, issue } : null;
	}

	public dispatchNextTask(
		availableAgents: string[] = ["solver", "qa", "docs", "ui"],
		readyIssues: GitHubIssue[],
	): DispatchResult {
		if (availableAgents.length === 0) {
			return { dispatched: false, reason: "No idle agents available in pool." };
		}
		const filtered = readyIssues.filter(
			(i) => i.status === "ready" && !i.labels.includes("status:done") && !this.loopBreaker?.isBlocked(i.number),
		);
		if (filtered.length === 0) {
			return { dispatched: false, reason: "No ready issues found in GitHub queue." };
		}

		for (const issue of filtered) {
			const res = this.tryDispatchIssue(issue, availableAgents);
			if (res) return res;
		}

		return {
			dispatched: false,
			reason: "No compatible idle agents or available ready issues without file conflicts.",
		};
	}

	public async handleTaskFailure(
		agentName: string,
		issueNumber: number,
		error: string,
		client?: GitHubClient,
		retainLocks = false,
	): Promise<TaskFailureResult> {
		if (!retainLocks) {
			this.worktreeManager.releaseFileLocks(agentName);
		}
		const diagnosis = formatSocraticDiagnosis(error);
		const diagnostic = diagnosis?.hint;
		const category = diagnosis?.category;

		if (!this.loopBreaker) {
			return { blocked: false, reason: diagnostic, diagnostic, category };
		}

		const evalResult = this.loopBreaker.recordFailure(issueNumber, error);
		let finalReason = evalResult.reason;
		if (diagnostic) {
			finalReason = finalReason
				? (finalReason.includes(diagnostic) ? finalReason : `${finalReason} | ${diagnostic}`)
				: diagnostic;
			try { evalResult.reason = finalReason; } catch { /* ignore if frozen */ }
		}

		if (evalResult.blocked) {
			if (retainLocks) this.worktreeManager.releaseFileLocks(agentName);
			if (client) await client.blockIssue(issueNumber, finalReason ?? "Threshold reached");
			return { blocked: true, reason: finalReason, diagnostic, category };
		}

		return { blocked: false, reason: finalReason ?? diagnostic, diagnostic, category };
	}

	public completeTask(agentName: string, issueNumber?: number): void {
		this.worktreeManager.releaseFileLocks(agentName);
		if (issueNumber && this.loopBreaker?.recordSuccess) {
			this.loopBreaker.recordSuccess(issueNumber);
		}
	}
}
