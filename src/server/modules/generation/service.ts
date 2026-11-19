import type { Db } from '../../db.js';
import { emptyUsage, ModelError, type ModelUsage } from '../../adapters/model.js';
import type { TaskRecord, TaskRun } from '../../runtime/tasks.js';
import { GenerationRepository } from './repository.js';

export class GenerationService {
  readonly repository: GenerationRepository;
  constructor(db: Db) { this.repository = new GenerationRepository(db); }
  async generate<T>(task: TaskRecord, run: TaskRun, operation: () => Promise<{ value: T; usage: ModelUsage }>) {
    const reason = await this.repository.reserve(task.owner_id!,task.id,run.executionId,task.input.automatic === true);
    if (reason) return { skipped: true as const, message: reason };
    try {
      const result = await operation();
      await this.repository.finish(run.executionId,result.usage);
      return result;
    } catch (error) {
      await this.repository.finish(run.executionId,error instanceof ModelError && error.usage ? error.usage : emptyUsage());
      if (error instanceof ModelError && error.reason === 'quota') await this.repository.pause(task.owner_id!);
      throw error;
    }
  }
}
