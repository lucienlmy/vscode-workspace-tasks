import * as vscode from 'vscode';
import { TaskRunner } from '../taskRunner';
import { TaskCacheService } from '../services/taskCacheService';

interface ITaskRunParameters {
  taskName: string;
  args?: string[];
}

export class TaskRunnerTool implements vscode.LanguageModelTool<ITaskRunParameters> {
  public async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<ITaskRunParameters>,
    _: vscode.CancellationToken
  ): Promise<vscode.PreparedToolInvocation> {
    const { taskName, args } = options.input;
    const argsString = args && args.length > 0 ? ` with args: ${args.join(' ')}` : '';
    const confirmationMessage = `Run task '${taskName}'${argsString}?`;

    return {
      invocationMessage: confirmationMessage
    };
  }

  public async invoke(
    options: vscode.LanguageModelToolInvocationOptions<ITaskRunParameters>,
    _: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    const params = options.input;
    const taskCache = TaskCacheService.getInstance();
    const tasks = taskCache.getAllTasks();
    const task = tasks.find((t) => t.label === params.taskName);

    if (!task) {
      return {
        content: [new vscode.LanguageModelTextPart(`Task '${params.taskName}' not found. Please verify the task name.`)]
      };
    }

    try {
      const taskRunner = TaskRunner.getInstance();
      await taskRunner.runTaskByName(params.taskName, params.args);

      return {
        content: [new vscode.LanguageModelTextPart(`Task '${params.taskName}' execution started.`)]
      };
    } catch (err: any) {
      return {
        content: [new vscode.LanguageModelTextPart(`Error executing task '${params.taskName}': ${err.message}`)]
      };
    }
  }
}
