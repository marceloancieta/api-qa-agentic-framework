import type { APIResponse } from '@playwright/test';
import { BaseClient, type RequestOptions } from '../../../helpers/base-client';

/** `books` operations. Methods return the raw response; the spec asserts. */
export class BooksClient extends BaseClient {
  /** GET /books/v1: Retrieves all books */
  apiViewsBooksGetAllBooks(options: RequestOptions = {}): Promise<APIResponse> {
    return this.get('books/v1', options);
  }

  /** POST /books/v1: Add new book */
  apiViewsBooksAddNewBook(options: RequestOptions = {}): Promise<APIResponse> {
    return this.post('books/v1', options);
  }

  /** GET /books/v1/{book_title}: Retrieves book by title along with secret */
  apiViewsBooksGetByTitle(
    bookTitle: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(this.route('books/v1/{book_title}', { book_title: bookTitle }), options);
  }
}
