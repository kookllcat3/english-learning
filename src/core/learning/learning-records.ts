export interface TimestampedRecord {
  createdAt?: string;
  updatedAt?: string;
}

export function newerRecord<T extends TimestampedRecord>(current: T, incoming: T): T {
  const currentTime = Date.parse(current.updatedAt ?? current.createdAt ?? "1970-01-01");
  const incomingTime = Date.parse(incoming.updatedAt ?? incoming.createdAt ?? "1970-01-01");
  return incomingTime >= currentTime ? incoming : current;
}

export function materialWithLearningProgress<
  T extends { knownCount: number; knownWords: string[]; updatedAt: string },
>(material: T, knownWords: string[], updatedAt: string): T {
  return {
    ...material,
    knownCount: knownWords.length,
    knownWords,
    updatedAt,
  } as T;
}

export function mergeNewerRecords<T extends TimestampedRecord, K extends keyof T>(
  current: T[],
  incoming: T[],
  key: K,
): T[] {
  const records = new Map<T[K], T>(current.map((record) => [record[key], record]));
  incoming.forEach((record) => {
    const existing = records.get(record[key]);
    records.set(record[key], existing ? newerRecord(existing, record) : record);
  });
  return [...records.values()];
}
