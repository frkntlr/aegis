import { GitHubTokenResolver } from './token-resolver.js';
import type { ProjectV2Info, ProjectStatusOption } from './types.js';

export interface ProjectsAdapterOptions {
  token?: string;
  owner?: string;
  repo?: string;
}

interface FieldNode {
  name: string;
  id: string;
  options?: Array<{ id: string; name: string }>;
}

interface ProjectDetailsResponse {
  user?: {
    projectV2?: {
      id: string;
      title: string;
      fields?: {
        nodes?: FieldNode[];
      };
    };
  };
}

export class GitHubProjectsAdapter {
  private token: string;
  private owner: string;
  private repo: string;

  constructor(options: ProjectsAdapterOptions = {}) {
    const resolved = GitHubTokenResolver.resolve(options.token);
    this.token = resolved.token || '';
    this.owner = options.owner || resolved.owner || 'frkntlr';
    this.repo = options.repo || resolved.repo || 'aegis';
  }

  private async executeGraphQL<T = Record<string, unknown>>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'User-Agent': 'Aegis-Autonomous-Engine',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query, variables })
    });
    if (!res.ok) {
      throw new Error(`GitHub GraphQL HTTP ${res.status}: ${res.statusText}`);
    }
    const data = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
    if (data.errors && data.errors.length > 0) {
      throw new Error(`GraphQL Error: ${data.errors[0].message}`);
    }
    return data.data as T;
  }

  public async listProjects(owner = this.owner): Promise<ProjectV2Info[]> {
    const query = `query($owner: String!) {
      user(login: $owner) {
        projectsV2(first: 20) {
          nodes { id number title url closed }
        }
      }
    }`;
    const data = await this.executeGraphQL<{ user?: { projectsV2?: { nodes?: ProjectV2Info[] } } }>(query, { owner });
    const nodes = data?.user?.projectsV2?.nodes || [];
    return nodes.map((n: ProjectV2Info) => ({
      id: n.id,
      number: n.number,
      title: n.title,
      url: n.url,
      closed: n.closed
    }));
  }

  public async getProjectDetails(projectNumber: number, owner = this.owner): Promise<{ id: string; title: string; statusFieldId?: string; statusOptions: ProjectStatusOption[] }> {
    const query = `query($owner: String!, $num: Int!) {
      user(login: $owner) {
        projectV2(number: $num) {
          id title
          fields(first: 20) {
            nodes {
              ... on ProjectV2SingleSelectField {
                id name options { id name }
              }
            }
          }
        }
      }
    }`;
    const data = await this.executeGraphQL<ProjectDetailsResponse>(query, { owner, num: projectNumber });
    const proj = data?.user?.projectV2;
    if (!proj) throw new Error(`Project #${projectNumber} not found for ${owner}.`);

    const statusField = (proj.fields?.nodes || []).find((f: FieldNode) => f.name === 'Status');
    return {
      id: proj.id,
      title: proj.title,
      statusFieldId: statusField?.id,
      statusOptions: statusField?.options || []
    };
  }

  public async addIssueToProject(projectId: string, issueNodeId: string): Promise<string> {
    const query = `mutation($projectId: ID!, $contentId: ID!) {
      addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
        item { id }
      }
    }`;
    const data = await this.executeGraphQL<{ addProjectV2ItemById?: { item?: { id: string } } }>(query, { projectId, contentId: issueNodeId });
    return data?.addProjectV2ItemById?.item?.id || '';
  }

  public async setItemStatus(projectId: string, itemId: string, fieldId: string, optionId: string): Promise<void> {
    const query = `mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
      updateProjectV2ItemFieldValue(input: {
        projectId: $projectId,
        itemId: $itemId,
        fieldId: $fieldId,
        value: { singleSelectOptionId: $optionId }
      }) {
        projectV2Item { id }
      }
    }`;
    await this.executeGraphQL(query, { projectId, itemId, fieldId, optionId });
  }

  public async syncIssue(projectNumber: number, issueNumber: number, status: 'ready' | 'in_progress' | 'done'): Promise<{ itemId: string; status: string }> {
    const details = await this.getProjectDetails(projectNumber);
    const issueRes = await fetch(`https://api.github.com/repos/${this.owner}/${this.repo}/issues/${issueNumber}`, {
      headers: { 'Authorization': `Bearer ${this.token}`, 'User-Agent': 'Aegis-Autonomous-Engine' }
    });
    const issueData = (await issueRes.json()) as { node_id?: string };
    if (!issueData.node_id) throw new Error(`Could not fetch node_id for issue #${issueNumber}`);

    const itemId = await this.addIssueToProject(details.id, issueData.node_id);
    const targetOptionName = status === 'ready' ? 'Todo' : status === 'in_progress' ? 'In Progress' : 'Done';
    const opt = details.statusOptions.find(o => o.name.toLowerCase() === targetOptionName.toLowerCase());

    if (details.statusFieldId && opt) {
      await this.setItemStatus(details.id, itemId, details.statusFieldId, opt.id);
    }
    return { itemId, status: targetOptionName };
  }
}
