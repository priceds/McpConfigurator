import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ManagedServerRecord } from "../../shared/types";

interface StoreShape {
  version: 1;
  managedServers: ManagedServerRecord[];
}

export class ManagedStore {
  constructor(private readonly storePath: string) {}

  async list(): Promise<ManagedServerRecord[]> {
    return (await this.readStore()).managedServers;
  }

  async upsert(record: ManagedServerRecord): Promise<void> {
    const store = await this.readStore();
    const withoutCurrent = store.managedServers.filter((item) => item.id !== record.id);
    store.managedServers = [record, ...withoutCurrent].sort((left, right) =>
      right.appliedAt.localeCompare(left.appliedAt)
    );
    await this.writeStore(store);
  }

  async get(id: string): Promise<ManagedServerRecord | undefined> {
    const store = await this.readStore();
    return store.managedServers.find((item) => item.id === id);
  }

  async remove(id: string): Promise<void> {
    const store = await this.readStore();
    store.managedServers = store.managedServers.filter((item) => item.id !== id);
    await this.writeStore(store);
  }

  private async readStore(): Promise<StoreShape> {
    try {
      const contents = await readFile(this.storePath, "utf8");
      const parsed = JSON.parse(contents) as StoreShape;
      if (!Array.isArray(parsed.managedServers)) {
        return { version: 1, managedServers: [] };
      }
      return parsed;
    } catch {
      return { version: 1, managedServers: [] };
    }
  }

  private async writeStore(store: StoreShape): Promise<void> {
    await mkdir(path.dirname(this.storePath), { recursive: true });
    await writeFile(this.storePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  }
}
