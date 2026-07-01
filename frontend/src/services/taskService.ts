import api from './api';
import { MyTasksResponse } from '../types/task.types';

export const taskService = {
  myTasks: async (): Promise<MyTasksResponse> => {
    const res = await api.get<MyTasksResponse>('/dashboard/my-tasks');
    return res.data;
  },
};
