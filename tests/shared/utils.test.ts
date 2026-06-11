import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { Utils } from '../../src/shared/utils.js';

const TEST_DIR = path.join(os.tmpdir(), 'watcher-test-utils');

describe('Utils', () => {
  beforeAll(async () => {
    await fs.ensureDir(TEST_DIR);
  });

  afterAll(async () => {
    await fs.remove(TEST_DIR);
  });

  describe('getFileExtension', () => {
    it('should return extension without dot', () => {
      expect(Utils.getFileExtension('file.ts')).toBe('ts');
      expect(Utils.getFileExtension('file.test.ts')).toBe('ts');
    });

    it('should handle paths with directories', () => {
      expect(Utils.getFileExtension('/path/to/file.js')).toBe('js');
    });

    it('should return empty string for files without extension', () => {
      expect(Utils.getFileExtension('Makefile')).toBe('');
    });

    it('should return lowercase extension', () => {
      expect(Utils.getFileExtension('file.TS')).toBe('ts');
    });
  });

  describe('isAllowedExtension', () => {
    it('should return true for allowed extensions', () => {
      expect(Utils.isAllowedExtension('file.ts', ['ts', 'js'])).toBe(true);
      expect(Utils.isAllowedExtension('file.js', ['ts', 'js'])).toBe(true);
    });

    it('should return false for disallowed extensions', () => {
      expect(Utils.isAllowedExtension('file.py', ['ts', 'js'])).toBe(false);
      expect(Utils.isAllowedExtension('file.ts', ['js'])).toBe(false);
    });
  });

  describe('sleep', () => {
    it('should resolve after the specified delay', async () => {
      const start = Date.now();
      await Utils.sleep(50);
      expect(Date.now() - start).toBeGreaterThanOrEqual(45);
    });
  });

  describe('debounce', () => {
    it('should only call the function once after rapid invocations', (done) => {
      let callCount = 0;
      const fn = Utils.debounce(() => {
        callCount++;
      }, 50);

      fn();
      fn();
      fn();

      setTimeout(() => {
        expect(callCount).toBe(1);
        done();
      }, 100);
    });
  });

  describe('pathExists', () => {
    it('should return true for existing files', async () => {
      const testFile = path.join(TEST_DIR, 'exists.txt');
      await fs.writeFile(testFile, 'test');
      expect(await Utils.pathExists(testFile)).toBe(true);
    });

    it('should return false for non-existing files', async () => {
      expect(await Utils.pathExists(path.join(TEST_DIR, 'nonexistent.txt'))).toBe(false);
    });
  });

  describe('readJsonFile', () => {
    it('should parse valid JSON files', async () => {
      const testFile = path.join(TEST_DIR, 'config.json');
      await fs.writeJson(testFile, { key: 'value' });
      const result = await Utils.readJsonFile<{ key: string }>(testFile);
      expect(result).toEqual({ key: 'value' });
    });

    it('should return null for non-existing files', async () => {
      const result = await Utils.readJsonFile(path.join(TEST_DIR, 'nope.json'));
      expect(result).toBeNull();
    });

    it('should return null for invalid JSON', async () => {
      const testFile = path.join(TEST_DIR, 'bad.json');
      await fs.writeFile(testFile, '{ invalid');
      const result = await Utils.readJsonFile(testFile);
      expect(result).toBeNull();
    });
  });

  describe('writeJsonFile', () => {
    it('should write valid JSON', async () => {
      const testFile = path.join(TEST_DIR, 'output.json');
      const success = await Utils.writeJsonFile(testFile, { a: 1, b: 2 });
      expect(success).toBe(true);
      const content = await fs.readJson(testFile);
      expect(content).toEqual({ a: 1, b: 2 });
    });
  });

  describe('findFiles', () => {
    it('should find files matching a glob pattern', async () => {
      await fs.writeFile(path.join(TEST_DIR, 'find-a.ts'), '');
      await fs.writeFile(path.join(TEST_DIR, 'find-b.ts'), '');
      const files = await Utils.findFiles('find-*.ts', TEST_DIR);
      expect(files.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('shouldExcludePath', () => {
    it('should exclude paths matching patterns', () => {
      const cwd = process.cwd().replace(/\\/g, '/');
      expect(Utils.shouldExcludePath(`${cwd}/node_modules/pkg/index.js`, ['node_modules'])).toBe(true);
      expect(Utils.shouldExcludePath(`${cwd}/src/index.ts`, ['node_modules'])).toBe(false);
    });
  });

  describe('validateConfig', () => {
    it('should validate against schema', async () => {
      const Joi = (await import('joi')).default;
      const schema = Joi.object({ name: Joi.string().required() });
      const config = Utils.validateConfig({ name: 'test' }, schema);
      expect(config).toEqual({ name: 'test' });
    });

    it('should throw on invalid config', async () => {
      const Joi = (await import('joi')).default;
      const schema = Joi.object({ name: Joi.string().required() });
      expect(() => Utils.validateConfig({}, schema)).toThrow();
    });
  });
});
