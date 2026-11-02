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
	): Promise<{ blocked: boolean; reason?: string }> {
		if (!retainLocks) {
			this.worktreeManager.releaseFileLocks(agentName);
		}

		if (!this.loopBreaker) {
			return { blocked: false };
		}

		const evalResult = this.loopBreaker.recordFailure(issueNumber, error);
		if (evalResult.blocked) {
			if (retainLocks) {
				this.worktreeManager.releaseFileLocks(agentName);
			}
			if (client) {
				await client.blockIssue(
					issueNumber,
					evalResult.reason ?? "Threshold reached",
				);
			}
			return { blocked: true, reason: evalResult.reason };
		}

		return { blocked: false };
	}

	public completeTask(agentName: string, issueNumber?: number): void {
		this.worktreeManager.releaseFileLocks(agentName);
		if (issueNumber && this.loopBreaker?.recordSuccess) {
			this.loopBreaker.recordSuccess(issueNumber);
		}
	}
}
