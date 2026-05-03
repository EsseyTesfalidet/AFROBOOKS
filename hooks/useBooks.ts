'use client';

import { useState, useEffect } from 'react';
import { getLiveBooks, getBook, getBooksByGenre, getFeaturedBooks, getTrendingBooks, getNewReleases } from '@/lib/firebase/firestore';
import type { Book } from '@/types/book';

export function useBooks(genreFilter?: string) {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const fetch = genreFilter
      ? getBooksByGenre(genreFilter, 50)
      : getLiveBooks();

    fetch.then((data) => {
      setBooks(data);
      setLoading(false);
    });
  }, [genreFilter]);

  return { books, loading };
}

export function useBook(bookId: string) {
  const [book, setBook] = useState<Book | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getBook(bookId).then((data) => {
      setBook(data);
      setLoading(false);
    });
  }, [bookId]);

  return { book, loading };
}

export function useFeaturedBooks() {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getFeaturedBooks(8).then((data) => {
      setBooks(data);
      setLoading(false);
    });
  }, []);

  return { books, loading };
}

export function useTrendingBooks() {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getTrendingBooks(10).then((data) => {
      setBooks(data);
      setLoading(false);
    });
  }, []);

  return { books, loading };
}

export function useNewReleases() {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getNewReleases(10).then((data) => {
      setBooks(data);
      setLoading(false);
    });
  }, []);

  return { books, loading };
}
