import * as vscode from 'vscode';
import { TaskProvider2, BaseTaskProvider2 } from '../taskProvider';
import { TaskItem } from '../taskItem';
import constants from '../libs/constants';
import { TaskFilesService } from '../services/taskFilesService';
import { TaskIconService } from '../services/taskIconService';
import { FilteredTaskService } from '../services/filteredTaskService';

export class VscodeTaskProvider extends BaseTaskProvider2 implements TaskProvider2 {
  constructor() {
    super('vscode', constants.GLOB_VSCODE);
  }

  public async provideTasks(token?: vscode.CancellationToken): Promise<vscode.Task[]> {
    if (!this.enabled || (token && token.isCancellationRequested)) {
      return [];
    }
    const resultingTasks: vscode.Task[] = [];
    const taskItems = await this.getTasks();

    // Use existing Visual Studio Code task defined in .vscode/tasks.json
    const tasks = await vscode.tasks.fetchTasks({ type: 'workspace' });
    for (const item of taskItems) {
      if (token && token.isCancellationRequested) {
        break;
      }
      const taskUri = item.taskFileUri;
      const targetWorkspaceFolder = taskUri
        ? vscode.workspace.getWorkspaceFolder(taskUri)
        : undefined;

      const found = tasks.find((t) => {
        const nameMatch = t.name === item.label && t.source.toLowerCase() === 'workspace';
        if (!nameMatch) {
          return false;
        }

        // If we know the target workspace folder, ensure the task belongs to it
        if (targetWorkspaceFolder && typeof t.scope === 'object' && 'uri' in t.scope) {
          return t.scope.uri.toString() === targetWorkspaceFolder.uri.toString();
        }

        // If we don't know the folder, or the task has global/workspace scope, accepts it as fallback
        return true;
      });

      if (found) {
        found.definition['__id'] = item.id;
        resultingTasks.push(found);
      }
      // return { task: found, cwd: undefined, native: true };

    }
    return resultingTasks;
  }

  public async getTasks(): Promise<TaskItem[]> {
    if (!this.enabled) {
      return [];
    }
    const tasks: TaskItem[] = [];
    const filesService = TaskFilesService.getInstance();
    const iconService = TaskIconService.getInstance();
    const filteredTaskService = FilteredTaskService.getInstance();
    const files = await filesService.findFiles([constants.GLOB_VSCODE]);

    for (const file of files) {
      try {
        const iconPath = iconService.getTaskIcon(this.type);

        const document = await vscode.workspace.openTextDocument(file);
        const text = document.getText();
        // Simple regex to strip comments.
        // WARNING: This is naive and can break if comments are inside strings.
        // But for standard tasks.json it's usually fine.
        const jsonText = text
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/^[ \t]*\/\/.*/gm, '') // Line comments
          .replace(/,\s*}/g, '}')
          .replace(/,\s*]/g, ']'); // Trailing commas cleanup (partial)

        // A safer way would be to treat it as standard JSON if possible, catch error and log.
        // Or require a jsonc parser dependency. For now, try/catch with naive cleaning.

        let json;
        try {
          json = JSON.parse(text); // Try strict JSON first
        } catch {
          // If strict fails, try cleaning comments
          json = JSON.parse(jsonText);
        }

        if (json && json.tasks && Array.isArray(json.tasks)) {
          for (const task of json.tasks) {

            const label = task.label || 'Unnamed Task';
            const item = new TaskItem(
              label,
              vscode.TreeItemCollapsibleState.None,
              this.type,
              file,
              undefined,
              iconPath,
            );
            item.taskFileUri = file;
            item.description = vscode.workspace.asRelativePath(file);
            // We do NOT set defaultIconPath, so it uses resourceUri (iconUri)

            // Find line number (approximate)
            const lines = text.split('\n');
            for (let i = 0; i < lines.length; i++) {
              if (lines[i].includes(`"${label}"`)) {
                item.startLine = i;
                break;
              }
            }

            item.onOpenActionCommand = {
              command: 'workspaceTasks.openFileAtLine',
              title: 'Open File',
              arguments: [file, item.startLine || 0],
            };

            // is the task hidden?
            if (this.isHiddenTask(task)) {
              if (!filteredTaskService.isUnhidden(item.id!) && !filteredTaskService.isFiltered(item.id!)) {
                filteredTaskService.hideTask(item);
              }
            }

            tasks.push(item);
          }
        }
      } catch (e) {
        console.error(`Error parsing tasks.json: ${file.fsPath}`, e);
      }
    }
    return tasks;
  }

  private isHiddenTask(task: any): boolean {
    if (!task) {
      return false;
    }
    const isTrue = (val: any) => val === true || val === 'true';
    return (
      (task.runOptions && isTrue(task.runOptions.hide)) ||
      isTrue(task.hide) ||
      (task.presentation && (isTrue(task.presentation.hide) || isTrue(task.presentation.hidden)))
    );
  }
}
