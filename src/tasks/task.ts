import { Task } from 'vscode';
export interface ITask extends Task {
  __id: string;
}

export function isITask(task: Task): task is ITask {
  return '__id' in task;
}
