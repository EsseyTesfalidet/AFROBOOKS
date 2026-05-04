'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { BadgeCheck, Globe, Twitter, Instagram, Linkedin, BookOpen } from 'lucide-react';
import BuyerHeader from '@/components/buyer/BuyerHeader';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import FollowButton from '@/components/shared/FollowButton';
import { db } from '@/lib/firebase/config';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { centsToDisplay } from '@/lib/utils/formatCurrency';
import type { Book } from '@/types/book';
import type { Seller } from '@/types/user';

interface AuthorProfile {
  firstName: string;
  lastName: string;
  bio: string;
  avatarUrl: string | null;
}

export default function AuthorPage() {
  const { id } = useParams<{ id: string }>();
  const [author, setAuthor] = useState<AuthorProfile | null>(null);
  const [seller, setSeller] = useState<Seller | null>(null);
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getDoc(doc(db, 'users', id)),
      getDoc(doc(db, 'sellers', id)),
      getDocs(query(collection(db, 'books'), where('sellerId', '==', id), where('status', '==', 'live'))),
    ]).then(([userSnap, sellerSnap, booksSnap]) => {
      if (userSnap.exists()) setAuthor(userSnap.data() as AuthorProfile);
      if (sellerSnap.exists()) setSeller(sellerSnap.data() as Seller);
      setBooks(booksSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Book)));
      setLoading(false);
    });
  }, [id]);

  if (loading) return (
    <div className="min-h-screen bg-[#0e0e0e]">
      <BuyerHeader />
      <div className="flex justify-center pt-20"><LoadingSpinner size={36} /></div>
    </div>
  );

  if (!author) return (
    <div className="min-h-screen bg-[#0e0e0e]">
      <BuyerHeader />
      <div className="flex justify-center pt-20 text-[#444]">Author not found.</div>
    </div>
  );

  const displayName = seller?.penName || `${author.firstName} ${author.lastName}`;
  const socialLinks = seller?.socialLinks;

  return (
    <div className="min-h-screen bg-[#0e0e0e]">
      <BuyerHeader />
      <main className="max-w-4xl mx-auto px-4 py-10">
        {/* Author header */}
        <div className="flex items-start gap-6 mb-8">
          <div className="w-20 h-20 rounded-full flex-shrink-0 flex items-center justify-center text-2xl font-bold"
            style={{ background: '#1a1a1a', color: '#f5b800', border: '2px solid #2a2a2a' }}>
            {author.avatarUrl
              ? <img src={author.avatarUrl} alt={displayName} className="w-full h-full rounded-full object-cover" />
              : displayName.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-display text-display-md text-white">{displayName}</h1>
              {seller?.isVerified && (
                <BadgeCheck size={20} style={{ color: '#f5b800' }} />
              )}
            </div>
            <div className="flex items-center gap-4 mt-1 mb-3 text-xs text-[#555]">
              <span>{books.length} book{books.length !== 1 ? 's' : ''}</span>
              <span>{seller?.totalSales ?? 0} sales</span>
              {(seller?.followersCount ?? 0) > 0 && <span>{seller!.followersCount} followers</span>}
              {seller?.averageRating ? <span>★ {seller.averageRating.toFixed(1)}</span> : null}
            </div>
            <FollowButton sellerId={id} initialFollowerCount={seller?.followersCount ?? 0} size="md" />
            {author.bio && (
              <p className="text-sm text-[#888] mt-3 max-w-xl leading-relaxed">{author.bio}</p>
            )}
            <div className="flex items-center gap-3 mt-3">
              {seller?.website && (
                <a href={seller.website} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-[#555] hover:text-white transition-colors">
                  <Globe size={13} /> Website
                </a>
              )}
              {socialLinks?.twitter && (
                <a href={socialLinks.twitter} target="_blank" rel="noopener noreferrer"
                  className="text-[#555] hover:text-white transition-colors">
                  <Twitter size={14} />
                </a>
              )}
              {socialLinks?.instagram && (
                <a href={socialLinks.instagram} target="_blank" rel="noopener noreferrer"
                  className="text-[#555] hover:text-white transition-colors">
                  <Instagram size={14} />
                </a>
              )}
              {socialLinks?.linkedin && (
                <a href={socialLinks.linkedin} target="_blank" rel="noopener noreferrer"
                  className="text-[#555] hover:text-white transition-colors">
                  <Linkedin size={14} />
                </a>
              )}
              {socialLinks?.goodreads && (
                <a href={socialLinks.goodreads} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-[#555] hover:text-white transition-colors">
                  <BookOpen size={13} /> Goodreads
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Books grid */}
        <div>
          <h2 className="text-sm font-medium text-white mb-4">Books by {displayName}</h2>
          {books.length === 0 ? (
            <p className="text-sm text-[#444] py-8 text-center">No published books yet.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {books.map((book) => (
                <Link key={book.id} href={`/book/${book.id}`}
                  className="group rounded-xl overflow-hidden border transition-colors"
                  style={{ background: '#111', borderColor: '#1a1a1a' }}>
                  <div className="aspect-[2/3] flex items-center justify-center text-3xl font-bold"
                    style={{ background: book.coverBgColor, color: book.coverAccentColor }}>
                    {book.coverUrl
                      ? <img src={book.coverUrl} alt={book.title} className="w-full h-full object-cover" />
                      : book.title.charAt(0)}
                  </div>
                  <div className="p-3">
                    <p className="text-xs font-medium text-white truncate">{book.title}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs" style={{ color: '#f5b800' }}>{centsToDisplay(book.price)}</span>
                      {book.averageRating > 0 && (
                        <span className="text-xs text-[#555]">★ {book.averageRating.toFixed(1)}</span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
