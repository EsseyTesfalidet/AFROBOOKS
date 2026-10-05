import type { User } from '@/types/user';

type Person = Partial<Pick<User, 'firstName' | 'lastName' | 'username' | 'email' | 'phone' | 'uid'>> & { id: string };

export function adminPersonName(person: Person) {
  const name = [person.firstName, person.lastName].filter(Boolean).join(' ').trim();
  return name || (person.phone?.trim() ? 'Phone account' : person.email?.trim() || person.username?.trim() || 'Unnamed account');
}

export function matchesAdminPerson(person: Person, search: string) {
  const query = search.trim().toLocaleLowerCase();
  if (!query) return true;
  const values = [adminPersonName(person), person.username, person.email, person.phone, person.id, person.uid];
  if (values.some(value => value?.toLocaleLowerCase().includes(query))) return true;
  // Accept pasted international numbers and punctuation without interpreting
  // digits within a person's name or email as a phone search.
  const digits = /^[+\d\s().-]+$/.test(query) ? query.replace(/\D/g, '') : '';
  return !!digits && !!person.phone?.replace(/\D/g, '').includes(digits);
}
