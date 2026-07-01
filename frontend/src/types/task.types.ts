// My Tasks (unified lead follow-ups + care-journey steps)

export type TaskType = 'care_step' | 'lead_follow_up';

export interface MyTask {
  task_type: TaskType;
  person_name?: string | null;
  phone_number?: string | null;
  record_id: string;              // enrollment_id or lead_id
  enrollment_id?: string | null;
  lead_id?: string | null;
  step_id?: string | null;        // care only
  action_name?: string | null;
  step_type?: string | null;      // channel
  service?: string | null;
  status?: string | null;         // lead status (follow-up rows)
  due_date?: string | null;
  is_overdue?: boolean;
  done?: number | null;           // care progress
  total?: number | null;
}

export interface MyTasksResponse {
  items: MyTask[];
  total: number;
  counts: { overdue: number; due_today: number; upcoming: number };
}
