import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const booksRoot = path.join(process.cwd(), "content", "books");
const contentRoot = path.join(process.cwd(), "content");

function stripBom(source: string) {
  return source.replace(/^\uFEFF/, "");
}

export type BookMetadata = {
  slug: string;
  title: string;
  titleTelugu?: string;
  author?: string;
  description?: string;
  language?: string;
  subject?: string;
  totalSargas?: number;
};

export type Verse = {
  number: string;
  telugu: string;
  transliteration?: string;
  notes?: string;
};

export type Sarga = {
  book: BookMetadata;
  slug: string;
  order: number;
  title: string;
  verses: Verse[];
};

export type LibraryUpdate = {
  date: string;
  book: string;
  description: string;
};

export type FutureWork = {
  title: string;
  status: "active" | "planned";
};

async function pathExists(filePath: string) {
  try {
    await readFile(filePath);
    return true;
  } catch {
    return false;
  }
}

function parseFrontmatter(source: string) {
  if (!source.startsWith("---")) {
    return { data: new Map<string, string>(), body: source };
  }

  const end = source.indexOf("\n---", 3);
  if (end === -1) {
    return { data: new Map<string, string>(), body: source };
  }

  const raw = source.slice(3, end).trim();
  const body = source.slice(end + 4).trim();
  const data = new Map<string, string>();

  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (match) {
      data.set(match[1], match[2].replace(/^["']|["']$/g, ""));
    }
  }

  return { data, body };
}

function parseVerseFields(block: string): Verse | null {
  const lines = block.split(/\r?\n/);
  const fields = new Map<string, string[]>();
  let current: string | null = null;

  for (const line of lines) {
    const field = line.match(/^(number|telugu|transliteration|notes):\s*(.*)$/);
    if (field) {
      current = field[1];
      fields.set(current, field[2] ? [field[2]] : []);
      continue;
    }

    if (current) {
      fields.get(current)?.push(line);
    }
  }

  const number = fields.get("number")?.join("\n").trim();
  const telugu = fields.get("telugu")?.join("\n").trim();

  if (!number || !telugu) {
    return null;
  }

  return {
    number,
    telugu,
    transliteration: fields.get("transliteration")?.join("\n").trim(),
    notes: fields.get("notes")?.join("\n").trim(),
  };
}

function parseSargaMarkdown(source: string) {
  const { data, body } = parseFrontmatter(source);
  const blocks = body.split(/^---verse---$/m).map((block) => block.trim()).filter(Boolean);

  return {
    order: Number(data.get("order") ?? 0),
    title: data.get("title") ?? "Untitled Sarga",
    verses: blocks.map(parseVerseFields).filter((verse): verse is Verse => Boolean(verse)),
  };
}

export async function getBooks(): Promise<BookMetadata[]> {
  const slugs: string[] = await readdir(booksRoot);
  const books = await Promise.all(
    slugs.map(async (slug: string) => {
      const filePath = path.join(booksRoot, slug, "metadata.json");
      const raw = stripBom(await readFile(filePath, "utf8"));
      return { slug, ...JSON.parse(raw) } as BookMetadata;
    }),
  );

  return books.sort((a: BookMetadata, b: BookMetadata) => a.title.localeCompare(b.title));
}

export async function getBook(slug: string) {
  const books = await getBooks();
  return books.find((book) => book.slug === slug);
}

export async function getSargas(bookSlug: string): Promise<Sarga[]> {
  const book = await getBook(bookSlug);
  if (!book) {
    return [];
  }

  const folder = path.join(booksRoot, bookSlug);
  const files: string[] = (await readdir(folder)).filter((file: string) => /^sarga-\d+\.md$/.test(file));
  const sargas = await Promise.all(
    files.map(async (file: string) => {
      const source = stripBom(await readFile(path.join(folder, file), "utf8"));
      const parsed = parseSargaMarkdown(source);
      return {
        book,
        slug: file.replace(/\.md$/, ""),
        ...parsed,
      };
    }),
  );

  return sargas.sort((a: Sarga, b: Sarga) => a.order - b.order);
}

export async function getSarga(bookSlug: string, sargaSlug: string) {
  const filePath = path.join(booksRoot, bookSlug, `${sargaSlug}.md`);
  if (!(await pathExists(filePath))) {
    return undefined;
  }

  const book = await getBook(bookSlug);
  if (!book) {
    return undefined;
  }

  const source = stripBom(await readFile(filePath, "utf8"));
  return { book, slug: sargaSlug, ...parseSargaMarkdown(source) } as Sarga;
}

export async function getSargaPaths() {
  const books = await getBooks();
  const paths = [];

  for (const book of books) {
    const sargas = await getSargas(book.slug);
    for (const sarga of sargas) {
      paths.push({ book: book.slug, sarga: sarga.slug });
    }
  }

  return paths;
}

export async function getLibraryUpdates(): Promise<LibraryUpdate[]> {
  const raw = stripBom(await readFile(path.join(contentRoot, "updates.json"), "utf8"));
  return (JSON.parse(raw) as LibraryUpdate[]).sort((a, b) => b.date.localeCompare(a.date));
}

export async function getFutureWorks(): Promise<FutureWork[]> {
  const raw = stripBom(await readFile(path.join(contentRoot, "future-works.json"), "utf8"));
  return JSON.parse(raw) as FutureWork[];
}

export async function getLibraryStats() {
  const books = await getBooks();
  const updates = await getLibraryUpdates();
  let sargaCount = 0;
  let verseCount = 0;

  for (const book of books) {
    const sargas = await getSargas(book.slug);
    sargaCount += sargas.length;
    verseCount += sargas.reduce((total, sarga) => total + sarga.verses.length, 0);
  }

  return {
    books: books.length,
    sargas: sargaCount,
    verses: verseCount,
    lastUpdated: updates[0]?.date ?? "",
  };
}

export async function getVerse(
  bookSlug: string,
  sargaSlug: string,
  verseNumber: string,
) {
  const sarga = await getSarga(bookSlug, sargaSlug);

  if (!sarga) {
    return undefined;
  }

  return sarga.verses.find(
    (verse) => verse.number === verseNumber,
  );
}

export async function getVersePaths() {
  const paths = [];

  const books = await getBooks();

  for (const book of books) {
    const sargas = await getSargas(book.slug);

    for (const sarga of sargas) {
      for (const verse of sarga.verses) {
        paths.push({
          book: book.slug,
          sarga: sarga.slug,
          verse: verse.number,
        });
      }
    }
  }

  return paths;
}