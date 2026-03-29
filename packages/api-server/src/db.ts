import type Database from 'better-sqlite3';
import { openDatabase, prepareStatements } from '@myco/core';
import type { MycoStatements } from '@myco/core';

let _db: Database.Database | null = null;
let _stmts: MycoStatements | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    _db = openDatabase();
  }
  return _db as Database.Database;
}

export function getStatements(): MycoStatements {
  if (!_stmts) {
    _stmts = prepareStatements(getDb());
  }
  return _stmts;
}
