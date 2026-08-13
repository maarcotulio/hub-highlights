import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/auth", () => ({ requireUser: vi.fn() }));

import { resolveDbUser } from "@/lib/currentUser";
import { prisma } from "@/lib/db";
import { ingestUpload } from "@/lib/ingest";

const statisticsFixture = readFileSync(
  join(process.cwd(), "lib", "parsers", "__fixtures__", "koreader-statistics.sqlite3")
);

function asArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  ) as ArrayBuffer;
}

async function createUser(authId: string, email = `${authId}@example.test`) {
  return prisma.user.create({ data: { authId, email } });
}

function pageState(page: {
  bookStatsId: string;
  page: number;
  startTime: Date;
  durationSec: number;
  totalPages: number;
}) {
  return {
    bookStatsId: page.bookStatsId,
    page: page.page,
    startTime: page.startTime,
    durationSec: page.durationSec,
    totalPages: page.totalPages,
  };
}

async function cleanDatabase() {
  await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS "integration_fail_page_stat" ON "PageStat"');
  await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS integration_fail_page_stat()');
  await prisma.pageStat.deleteMany();
  await prisma.bookStats.deleteMany();
  await prisma.highlight.deleteMany();
  await prisma.book.deleteMany();
  await prisma.user.deleteMany();
}

beforeEach(cleanDatabase);

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

describe("persisted ownership and identity constraints", () => {
  it("treats a null author as part of the per-user book identity", async () => {
    const firstOwner = await createUser("constraint-owner-1");
    const secondOwner = await createUser("constraint-owner-2");
    const book = {
      title: "Authorless Book",
      author: null,
      source: "KOREADER" as const,
    };

    await prisma.book.create({ data: { ...book, userId: firstOwner.id } });

    await expect(
      prisma.book.create({ data: { ...book, userId: firstOwner.id } })
    ).rejects.toMatchObject({ code: "P2002" });
    await expect(
      prisma.book.create({ data: { ...book, userId: secondOwner.id } })
    ).resolves.toMatchObject({ userId: secondOwner.id });
  });

  it("enforces a non-null KOReader hash once per owner", async () => {
    const firstOwner = await createUser("hash-owner-1");
    const secondOwner = await createUser("hash-owner-2");

    await prisma.book.create({
      data: {
        userId: firstOwner.id,
        title: "First title",
        source: "KOREADER",
        md5: "same-partial-hash",
      },
    });

    await expect(
      prisma.book.create({
        data: {
          userId: firstOwner.id,
          title: "Different title",
          source: "KOREADER",
          md5: "same-partial-hash",
        },
      })
    ).rejects.toMatchObject({ code: "P2002" });
    await expect(
      prisma.book.create({
        data: {
          userId: secondOwner.id,
          title: "Different owner",
          source: "KOREADER",
          md5: "same-partial-hash",
        },
      })
    ).resolves.toMatchObject({ userId: secondOwner.id });
  });

  it("keeps all application tables unavailable to Supabase Data API roles", async () => {
    const permissions = await prisma.$queryRaw<
      Array<{
        tableName: string;
        rlsEnabled: boolean;
        anonSelect: boolean;
        anonWrite: boolean;
        authenticatedSelect: boolean;
        authenticatedWrite: boolean;
      }>
    >`
      SELECT
        c.relname AS "tableName",
        c.relrowsecurity AS "rlsEnabled",
        has_table_privilege('anon', c.oid, 'SELECT') AS "anonSelect",
        has_table_privilege('anon', c.oid, 'INSERT,UPDATE,DELETE') AS "anonWrite",
        has_table_privilege('authenticated', c.oid, 'SELECT') AS "authenticatedSelect",
        has_table_privilege('authenticated', c.oid, 'INSERT,UPDATE,DELETE') AS "authenticatedWrite"
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname IN ('User', 'Book', 'Highlight', 'BookStats', 'PageStat')
      ORDER BY c.relname
    `;

    expect(permissions).toHaveLength(5);
    for (const permission of permissions) {
      expect(permission).toMatchObject({
        rlsEnabled: true,
        anonSelect: false,
        anonWrite: false,
        authenticatedSelect: false,
        authenticatedWrite: false,
      });
    }

    for (const role of ["anon", "authenticated"]) {
      const client = new Client({ connectionString: process.env.DATABASE_URL });
      await client.connect();
      try {
        await client.query("BEGIN");
        await client.query(`SET LOCAL ROLE ${role}`);
        await expect(client.query('SELECT * FROM "Book"')).rejects.toThrow(
          /permission denied|row-level security/i
        );
      } finally {
        await client.query("ROLLBACK").catch(() => undefined);
        await client.end();
      }
    }
  });
});

describe("real transaction behavior", () => {
  it("converges concurrent imports on one book and one highlight", async () => {
    const owner = await createUser("concurrent-import-owner");
    const lua = `return {
      doc_props = { title = "Concurrent Book" },
      annotations = {
        { color = "yellow", text = "Imported once", pageno = 7 },
      },
    }`;
    const file = new TextEncoder().encode(lua).buffer;

    const results = await Promise.all([
      ingestUpload(owner.id, "metadata.lua", file),
      ingestUpload(owner.id, "metadata.lua", file),
    ]);

    expect(results.every((result) => result.status === "success")).toBe(true);
    expect(await prisma.book.count({ where: { userId: owner.id } })).toBe(1);
    expect(
      await prisma.highlight.count({ where: { book: { userId: owner.id } } })
    ).toBe(1);
  });

  it("rolls back the stats replacement when a later page insert fails", async () => {
    const owner = await createUser("rollback-owner");
    const file = asArrayBuffer(statisticsFixture);
    const first = await ingestUpload(owner.id, "statistics.sqlite3", file);
    expect(first.status).toBe("success");

    const bookStats = await prisma.bookStats.findFirstOrThrow({
      where: { book: { userId: owner.id } },
      include: { pageStats: { orderBy: [{ startTime: "asc" }, { id: "asc" }] } },
    });
    const snapshot = bookStats.pageStats.map(pageState);

    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION integration_fail_page_stat() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'intentional integration-test insert failure';
      END;
      $$
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER "integration_fail_page_stat"
      BEFORE INSERT ON "PageStat"
      FOR EACH ROW EXECUTE FUNCTION integration_fail_page_stat()
    `);

    await expect(
      ingestUpload(owner.id, "statistics.sqlite3", file)
    ).rejects.toThrow(/intentional integration-test insert failure|query execution/i);

    const persisted = await prisma.pageStat.findMany({
      where: { bookStatsId: bookStats.id },
      orderBy: [{ startTime: "asc" }, { id: "asc" }],
    });
    expect(persisted.map(pageState)).toEqual(snapshot);
  });
});

describe("persisted authentication ownership", () => {
  it("maps concurrent first requests for one auth subject to one user row", async () => {
    const authUser = {
      id: "auth-subject-concurrent",
      email: "first@example.test",
    };

    const [first, second] = await Promise.all([
      resolveDbUser(authUser as never),
      resolveDbUser({ ...authUser } as never),
    ]);

    expect(first.id).toBe(second.id);
    expect(await prisma.user.count({ where: { authId: authUser.id } })).toBe(1);
  });

  it("follows the auth subject across email changes and never adopts by recycled email", async () => {
    const original = await resolveDbUser({
      id: "stable-auth-subject",
      email: "recycled@example.test",
    } as never);
    const afterEmailChange = await resolveDbUser({
      id: "stable-auth-subject",
      email: "new@example.test",
    } as never);
    const newOwnerOfOldEmail = await resolveDbUser({
      id: "different-auth-subject",
      email: "recycled@example.test",
    } as never);

    expect(afterEmailChange.id).toBe(original.id);
    expect(afterEmailChange.email).toBe("new@example.test");
    expect(newOwnerOfOldEmail.id).not.toBe(original.id);
    expect(await prisma.user.count()).toBe(2);
  });
});
