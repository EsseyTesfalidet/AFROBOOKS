export class WatchError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
