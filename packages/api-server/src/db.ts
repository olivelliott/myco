import type Database from 'better-sqlite3';
import { openDatabase } from '@ai-workbots/core';

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    _db = openDatabase();
  }
  return _db;
}
