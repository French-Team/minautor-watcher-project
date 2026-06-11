import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { JSONValidator, PatternValidator, ValidatorRegistry, createValidatorRegistry } from '../../src/prevention/validators.js';

const TEST_DIR = path.join(os.tmpdir(), 'watcher-test-validators');

describe('Validators', () => {
  beforeAll(async () => {
    await fs.ensureDir(TEST_DIR);
  });

  afterAll(async () => {
    await fs.remove(TEST_DIR);
  });

  describe('JSONValidator', () => {
    it('should validate valid JSON', async () => {
      const filePath = path.join(TEST_DIR, 'valid.json');
      await fs.writeJson(filePath, { key: 'value' });
      const validator = new JSONValidator({ enabled: true, rules: {} });
      const result = await validator.validate(filePath);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid JSON', async () => {
      const filePath = path.join(TEST_DIR, 'invalid.json');
      await fs.writeFile(filePath, '{ broken');
      const validator = new JSONValidator({ enabled: true, rules: {} });
      const result = await validator.validate(filePath);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].rule).toBe('json-syntax');
    });

    it('should skip validation when disabled', async () => {
      const filePath = path.join(TEST_DIR, 'bad.json');
      await fs.writeFile(filePath, '{ broken');
      const validator = new JSONValidator({ enabled: false, rules: {} });
      const result = await validator.validate(filePath);
      expect(result.isValid).toBe(true);
    });
  });

  describe('PatternValidator', () => {
    it('should detect console.log pattern', async () => {
      const filePath = path.join(TEST_DIR, 'test.js');
      await fs.writeFile(filePath, 'console.log("test");\nconst x = 1;');
      const validator = new PatternValidator({
        enabled: true,
        rules: {},
        customRules: [
          { name: 'console-log', pattern: /console\.log\(/, message: 'Avoid console.log', severity: 'warning' },
        ],
      });
      const result = await validator.validate(filePath);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0].rule).toBe('console-log');
    });

    it('should detect TODO comments', async () => {
      const filePath = path.join(TEST_DIR, 'test.js');
      await fs.writeFile(filePath, '// TODO: implement this\nconst x = 1;');
      const validator = new PatternValidator({
        enabled: true,
        rules: {},
        customRules: [
          { name: 'todo-comment', pattern: /TODO/i, message: 'TODO found', severity: 'warning' },
        ],
      });
      const result = await validator.validate(filePath);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0].rule).toBe('todo-comment');
    });

    it('should report severity correctly', async () => {
      const filePath = path.join(TEST_DIR, 'test.js');
      await fs.writeFile(filePath, 'eval("danger");');
      const validator = new PatternValidator({
        enabled: true,
        rules: {},
        customRules: [
          { name: 'no-eval', pattern: /eval\(/, message: 'Avoid eval', severity: 'error' },
        ],
      });
      const result = await validator.validate(filePath);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.isValid).toBe(false);
    });

    it('should skip when disabled', async () => {
      const filePath = path.join(TEST_DIR, 'test.js');
      await fs.writeFile(filePath, 'console.log("test");');
      const validator = new PatternValidator({
        enabled: false,
        rules: {},
        customRules: [
          { name: 'console-log', pattern: /console\.log\(/, message: 'Avoid console.log', severity: 'warning' },
        ],
      });
      const result = await validator.validate(filePath);
      expect(result.isValid).toBe(true);
    });
  });

  describe('ValidatorRegistry', () => {
    it('should register and retrieve validators', () => {
      const registry = new ValidatorRegistry();
      const validator = new JSONValidator({ enabled: true, rules: {} });
      registry.register('json', validator);
      expect(registry.get('json')).toBe(validator);
    });

    it('should get all registered validators', () => {
      const registry = new ValidatorRegistry();
      registry.register('json', new JSONValidator({ enabled: true, rules: {} }));
      registry.register('pattern', new PatternValidator({ enabled: true, rules: {} }));
      expect(registry.getAll()).toHaveLength(2);
    });

    it('should validate files with applicable validators', async () => {
      const filePath = path.join(TEST_DIR, 'data.json');
      await fs.writeJson(filePath, { valid: true });

      const registry = new ValidatorRegistry();
      registry.register('json', new JSONValidator({ enabled: true, rules: {} }));
      const result = await registry.validateFile(filePath);
      expect(result.isValid).toBe(true);
    });
  });

  describe('createValidatorRegistry', () => {
    it('should create registry with default validators', () => {
      const registry = createValidatorRegistry();
      const names = registry.getAll().map(v => v.getName());
      expect(names).toContain('eslint');
      expect(names).toContain('json');
      expect(names).toContain('yaml');
      expect(names).toContain('pattern');
    });
  });
});
