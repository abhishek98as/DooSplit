#!/usr/bin/env node

/**
 * ImageKit Integration Test Runner
 *
 * Runs comprehensive tests for ImageKit.io integration
 */

const path = require('path');
const fs = require('fs');

// Simple test framework
class TestRunner {
  constructor() {
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
    this.currentSuite = null;
  }

  describe(name, fn) {
    console.log(`\n📋 ${name}`);
    this.currentSuite = name;
    fn();
  }

  test(name, fn) {
    this.tests.push({ name, fn, suite: this.currentSuite });
  }

  async run() {
    console.log('🚀 Starting ImageKit Integration Tests\n');

    for (const test of this.tests) {
      try {
        console.log(`⏳ ${test.suite} > ${test.name}`);
        await test.fn();
        console.log(`✅ ${test.suite} > ${test.name}`);
        this.passed++;
      } catch (error) {
        console.log(`❌ ${test.suite} > ${test.name}`);
        console.log(`   Error: ${error.message}`);
        this.failed++;
      }
    }

    console.log(`\n📊 Test Results:`);
    console.log(`   ✅ Passed: ${this.passed}`);
    console.log(`   ❌ Failed: ${this.failed}`);
    console.log(`   📈 Total: ${this.tests.length}`);

    if (this.failed > 0) {
      console.log('\n❌ Some tests failed!');
      process.exit(1);
    } else {
      console.log('\n🎉 All tests passed!');
    }
  }
}

// Mock expect function for simple assertions
function expect(actual) {
  return {
    toBe(expected) {
      if (actual !== expected) {
        throw new Error(`Expected ${expected}, but got ${actual}`);
      }
    },
    toBeDefined() {
      if (actual === undefined || actual === null) {
        throw new Error(`Expected value to be defined, but got ${actual}`);
      }
    },
    toContain(substring) {
      if (!actual.includes(substring)) {
        throw new Error(`Expected "${actual}" to contain "${substring}"`);
      }
    },
    toBeGreaterThan(expected) {
      if (actual <= expected) {
        throw new Error(`Expected ${actual} to be greater than ${expected}`);
      }
    },
    toBeLessThanOrEqual(expected) {
      if (actual > expected) {
        throw new Error(`Expected ${actual} to be less than or equal to ${expected}`);
      }
    },
  };
}

// Load and run tests
async function runTests() {
  try {
    // Set global variables
    global.describe = (name, fn) => runner.describe(name, fn);
    global.test = (name, fn) => runner.test(name, fn);
    global.expect = expect;

    // Load the test file
    const testFile = path.join(__dirname, 'imagekit-integration.test.js');
    require(testFile);

    // Run all tests
    await runner.run();

  } catch (error) {
    console.error('❌ Test runner error:', error.message);
    process.exit(1);
  }
}

// Create test runner instance
const runner = new TestRunner();

// Run tests
runTests().catch(console.error);