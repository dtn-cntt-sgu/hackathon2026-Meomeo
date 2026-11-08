import postgres from "postgres";

export type TransactionSql = postgres.TransactionSql;

// Bẫy mảng boolean: driver postgres gửi sai kiểu, truyền chuỗi '{true,false}' rồi ép ::text::boolean[]

const globalForSql = globalThis as unknown as {
  __simplifeySql?: ReturnType<typeof postgres>;
};

export const sql =
  globalForSql.__simplifeySql ??
  postgres(process.env.DATABASE_URL as string, { max: 5, prepare: false });

if (process.env.NODE_ENV !== "production") {
  globalForSql.__simplifeySql = sql;
}

async function tx<T>(cb: (tx: TransactionSql) => T | Promise<T>): Promise<T> {
  return sql.begin(cb) as unknown as Promise<T>;
}

export const db = { sql, tx };
