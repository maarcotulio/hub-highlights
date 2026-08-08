import type { MockBook } from "./types";

export const mockBooks: MockBook[] = [
  {
    id: "908e6e54-806d-4a29-ac85-d22d1b365172",
    title: "The Overstory",
    author: "Richard Powers",
    source: "KINDLE",
    highlights: [
      {
        id: "h1",
        text: "There are no individuals in a forest, no separable events.",
        note: "Reminds me of mycelial network research",
        chapter: "Roots",
        location: "Loc. 412",
        highlightedAt: "2026-03-03T00:00:00.000Z",
      },
      {
        id: "h2",
        text: "A tree is a slow, woody experiment in the possible use of sunlight.",
        note: null,
        chapter: "Roots",
        location: "Loc. 890",
        highlightedAt: "2026-03-04T00:00:00.000Z",
      },
      {
        id: "h3",
        text: "The best arguments in the world won't change a single person's mind. The only thing that can do that is a good story.",
        note: "Central thesis",
        chapter: "Trunk",
        location: "Loc. 1204",
        highlightedAt: "2026-03-06T00:00:00.000Z",
      },
      {
        id: "h4",
        text: "People see better what looks like them.",
        note: null,
        chapter: "Trunk",
        location: "Loc. 1580",
        highlightedAt: "2026-03-09T00:00:00.000Z",
      },
      {
        id: "h5",
        text: "Late in the book of her life, Adam will understand: nothing is more wasted than the things said to the young.",
        note: null,
        chapter: "Crown",
        location: "Loc. 2103",
        highlightedAt: "2026-03-14T00:00:00.000Z",
      },
    ],
  },
  {
    id: "46706f62-4fd4-4dcf-9408-f94baee804a5",
    title: "Braiding Sweetgrass",
    author: "Robin Wall Kimmerer",
    source: "KOREADER",
    highlights: [
      {
        id: "h6",
        text: "In some Native languages the term for plants translates to 'those who take care of us.'",
        note: null,
        chapter: "Skywoman Falling",
        location: "page 12",
        highlightedAt: "2026-01-20T00:00:00.000Z",
      },
      {
        id: "h7",
        text: "All flourishing is mutual.",
        note: "Good title for something someday",
        chapter: "The Council of Pecans",
        location: "page 88",
        highlightedAt: "2026-01-25T00:00:00.000Z",
      },
      {
        id: "h8",
        text: "Cultures of gratitude must be linked to deep understanding of ecosystem structure and function.",
        note: null,
        chapter: "The Gift of Strawberries",
        location: "page 103",
        highlightedAt: "2026-02-01T00:00:00.000Z",
      },
    ],
  },
  {
    id: "446c0f03-ca89-482a-beeb-51e15ec11096",
    title: "Pale Fire",
    author: "Vladimir Nabokov",
    source: "KINDLE",
    highlights: [
      {
        id: "h9",
        text: "Life is a great surprise. I do not see why death should not be an even greater one.",
        note: null,
        chapter: null,
        location: "Loc. 2044",
        highlightedAt: "2025-11-11T00:00:00.000Z",
      },
    ],
  },
  {
    id: "e608c10d-16c5-43ee-aa98-1bbf53f19be2",
    title: "The Long Way to a Small, Angry Planet",
    author: "Becky Chambers",
    source: "KOREADER",
    highlights: [],
  },
  {
    id: "01258c0f-703e-4fd5-b30d-65d2142a0467",
    title: "Consider the Lobster",
    author: "David Foster Wallace",
    source: "KINDLE",
    highlights: [
      {
        id: "h10",
        text: "The whole thing is even more disturbing if you consider the anatomical similarities between lobsters and human beings.",
        note: null,
        chapter: null,
        location: "Loc. 88",
        highlightedAt: "2025-09-02T00:00:00.000Z",
      },
      {
        id: "h11",
        text: "Given this article's venue and my own lack of culinary expertise, the question of whether and why boiling a lobster alive might be wrong.",
        note: "Framing device for the whole essay",
        chapter: null,
        location: "Loc. 140",
        highlightedAt: "2025-09-02T00:00:00.000Z",
      },
    ],
  },
];

export function getBookById(id: string): MockBook | undefined {
  return mockBooks.find((book) => book.id === id);
}

export function totalHighlightCount(books: MockBook[]): number {
  return books.reduce((sum, book) => sum + book.highlights.length, 0);
}
