import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { computeDedupeHash } from "../lib/parsers/normalize";

const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const user = await prisma.user.upsert({
    where: { email: "demo@highlightshub.dev" },
    update: {},
    create: { email: "demo@highlightshub.dev" },
  });

  const book1 = await prisma.book.upsert({
    where: {
      userId_title_author_source: {
        userId: user.id,
        title: "Sapiens",
        author: "Yuval Noah Harari",
        source: "KINDLE",
      },
    },
    update: {},
    create: {
      userId: user.id,
      title: "Sapiens",
      author: "Yuval Noah Harari",
      source: "KINDLE",
    },
  });

  const book2 = await prisma.book.upsert({
    where: {
      userId_title_author_source: {
        userId: user.id,
        title: "Thinking, Fast and Slow",
        author: "Daniel Kahneman",
        source: "KOREADER",
      },
    },
    update: {},
    create: {
      userId: user.id,
      title: "Thinking, Fast and Slow",
      author: "Daniel Kahneman",
      source: "KOREADER",
    },
  });

  const highlights = [
    {
      book: book1,
      text: "History is something that very few people have been doing while everyone else was ploughing fields and carrying water buckets.",
      note: null,
      location: "Location 245-247",
      chapter: "Chapter 1: An Animal of No Significance",
      highlightedAt: new Date("2025-11-02T20:14:00Z"),
    },
    {
      book: book1,
      text: "Fiction has enabled us not merely to imagine things, but to do so collectively.",
      note: "This is the core thesis",
      location: "Location 612-613",
      chapter: "Chapter 2: The Tree of Knowledge",
      highlightedAt: new Date("2025-11-03T09:41:00Z"),
    },
    {
      book: book2,
      text: "Nothing in life is as important as you think it is, while you are thinking about it.",
      note: null,
      location: "page 402",
      chapter: "Part 4: Choices",
      highlightedAt: new Date("2025-12-10T22:05:00Z"),
    },
  ];

  for (const h of highlights) {
    await prisma.highlight.upsert({
      where: {
        bookId_dedupeHash: {
          bookId: h.book.id,
          dedupeHash: computeDedupeHash(h.text, h.location),
        },
      },
      update: {},
      create: {
        bookId: h.book.id,
        text: h.text,
        note: h.note,
        location: h.location,
        chapter: h.chapter,
        highlightedAt: h.highlightedAt,
        dedupeHash: computeDedupeHash(h.text, h.location),
      },
    });
  }

  console.log(`Seeded user ${user.email} with 2 books and ${highlights.length} highlights.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
