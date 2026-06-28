// Global task registry — a tiny pub/sub store so every tool can report its
// running/finished jobs to a single "Centre de tâches" panel. Kept in-memory
// (active session only); finished tasks also flow into the recents history.

export type TaskStatus = "running" | "done" | "error";
export type Task = {
  id: string;
  title: string;
  tool: string;
  status: TaskStatus;
  percent: number;        // 0–100; ignored when indeterminate
  indeterminate?: boolean;
  outputPath?: string;
  error?: string;
  at: number;
};

let tasks: Task[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

export function subscribeTasks(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function getTasks(): Task[] {
  return tasks;
}
export function activeCount(): number {
  return tasks.filter(t => t.status === "running").length;
}

export function startTask(id: string, title: string, tool: string, indeterminate = false) {
  tasks = [{ id, title, tool, status: "running", percent: 0, indeterminate, at: Date.now() }, ...tasks.filter(t => t.id !== id)].slice(0, 60);
  emit();
}
export function updateTask(id: string, percent: number, title?: string) {
  tasks = tasks.map(t => t.id === id ? { ...t, percent, ...(title ? { title } : {}) } : t);
  emit();
}
export function finishTask(id: string, ok: boolean, outputPath?: string, error?: string) {
  tasks = tasks.map(t => t.id === id ? { ...t, status: ok ? "done" : "error", percent: 100, outputPath, error } : t);
  emit();
}
export function clearFinished() {
  tasks = tasks.filter(t => t.status === "running");
  emit();
}
