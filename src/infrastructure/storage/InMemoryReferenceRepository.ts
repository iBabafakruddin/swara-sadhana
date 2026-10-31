import type { ReferenceRepository } from '@/application/ports';
import type { Reference, ReferenceId } from '@/domain/reference/Reference';

/** Non-persistent repository for tests and environments without IndexedDB. */
export class InMemoryReferenceRepository implements ReferenceRepository {
  private readonly records = new Map<ReferenceId, Reference>();

  async save(reference: Reference): Promise<void> {
    this.records.set(reference.id, reference);
  }

  async findAll(): Promise<Reference[]> {
    return [...this.records.values()];
  }

  async findById(id: ReferenceId): Promise<Reference | undefined> {
    return this.records.get(id);
  }

  async delete(id: ReferenceId): Promise<void> {
    this.records.delete(id);
  }
}
