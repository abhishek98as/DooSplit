#!/usr/bin/env node

/**
 * Supabase Configuration Validator
 * 
 * Checks that all required Supabase environment variables are set
 * and validates the configuration before running migrations.
 * 
 * Usage:
 *   node scripts/validate-supabase-config.js
 * 
 * Note: Ensure .env.local is loaded before running this script, or
 * run it via Next.js which automatically loads environment files.
 */

// Try to load environment variables from .env.local if dotenv is available
try {
  const fs = require('fs');
  const path = require('path');
  const envPath = path.join(__dirname, '..', '.env.local');
  
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^=:#]+)=(.*)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
      }
    });
  }
} catch (err) {
  console.log('Note: Could not load .env.local automatically. Ensure environment variables are set.');
}

const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('');
  log(`${'='.repeat(60)}`, 'cyan');
  log(title, 'bright');
  log(`${'='.repeat(60)}`, 'cyan');
  console.log('');
}

function checkEnvVar(name, required = true) {
  const value = process.env[name];
  const status = value ? '✓' : '✗';
  const color = value ? 'green' : (required ? 'red' : 'yellow');
  const label = required ? 'REQUIRED' : 'OPTIONAL';
  
  log(`  ${status} ${name}`, color);
  if (!value && required) {
    log(`    Missing: ${name} (${label})`, 'red');
    return false;
  } else if (!value && !required) {
    log(`    Not set: ${name} (${label} - will use defaults)`, 'yellow');
    return true;
  } else {
    const preview = value.length > 30 ? `${value.substring(0, 30)}...` : value;
    log(`    Value: ${preview}`, 'cyan');
    return true;
  }
}

async function validateSupabaseConnection() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!url || !serviceKey) {
    log('  ✗ Cannot test connection - missing URL or service key', 'red');
    return false;
  }
  
  try {
    const supabase = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    
    // First, test raw connectivity by hitting the REST health endpoint
    const { data: healthData, error: healthError } = await supabase
      .from('users')
      .select('count')
      .limit(1);
    
    // Table not found errors mean connection is fine, schema just needs to be applied
    const tableNotFound = healthError && (
      healthError.message.includes('relation') ||
      healthError.message.includes('schema cache') ||
      healthError.message.includes('does not exist') ||
      healthError.code === '42P01' ||
      healthError.code === 'PGRST204'
    );
    
    if (tableNotFound) {
      log('  ✓ Connection to Supabase successful!', 'green');
      log('  ⚠ Tables not yet created (expected before migration)', 'yellow');
      log('    Run in Supabase SQL Editor:', 'yellow');
      log('      1. supabase/migrations/0001_core.sql', 'yellow');
      log('      2. supabase/migrations/0002_rls_and_storage.sql', 'yellow');
      return true;
    }
    
    if (healthError) {
      // Check if it's a network/auth error vs a schema error
      if (healthError.message.includes('fetch') || healthError.message.includes('network')) {
        log(`  ✗ Network error: ${healthError.message}`, 'red');
        return false;
      }
      log(`  ⚠ Connection OK but query error: ${healthError.message}`, 'yellow');
      return true;
    }
    
    log('  ✓ Connection successful!', 'green');
    log(`    Tables exist and are queryable`, 'cyan');
    return true;
  } catch (err) {
    log(`  ✗ Connection failed: ${err.message}`, 'red');
    return false;
  }
}

function validateJWTSecret() {
  const secret = process.env.SUPABASE_JWT_SECRET;
  
  if (!secret) {
    log('  ✗ SUPABASE_JWT_SECRET not set', 'red');
    return false;
  }
  
  try {
    // Try to sign a test token
    const testPayload = {
      sub: 'test-user-id',
      email: 'test@example.com',
      role: 'authenticated',
    };
    
    const token = jwt.sign(testPayload, secret, {
      algorithm: 'HS256',
      expiresIn: '5m',
    });
    
    // Try to verify it
    const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });
    
    if (decoded.sub === 'test-user-id') {
      log('  ✓ JWT secret is valid and can sign/verify tokens', 'green');
      return true;
    }
  } catch (err) {
    log(`  ✗ JWT secret validation failed: ${err.message}`, 'red');
    return false;
  }
  
  return false;
}

function validateMigrationFlags() {
  const backendMode = process.env.DATA_BACKEND_MODE;
  const writeMode = process.env.DATA_WRITE_MODE;
  
  const validBackendModes = ['mongo', 'shadow', 'supabase'];
  const validWriteModes = ['single', 'dual'];
  
  let valid = true;
  
  if (!backendMode) {
    log('  ⚠ DATA_BACKEND_MODE not set, defaulting to "mongo"', 'yellow');
  } else if (!validBackendModes.includes(backendMode)) {
    log(`  ✗ Invalid DATA_BACKEND_MODE: ${backendMode}`, 'red');
    log(`    Must be one of: ${validBackendModes.join(', ')}`, 'red');
    valid = false;
  } else {
    log(`  ✓ DATA_BACKEND_MODE: ${backendMode}`, 'green');
  }
  
  if (!writeMode) {
    log('  ⚠ DATA_WRITE_MODE not set, defaulting to "single"', 'yellow');
  } else if (!validWriteModes.includes(writeMode)) {
    log(`  ✗ Invalid DATA_WRITE_MODE: ${writeMode}`, 'red');
    log(`    Must be one of: ${validWriteModes.join(', ')}`, 'red');
    valid = false;
  } else {
    log(`  ✓ DATA_WRITE_MODE: ${writeMode}`, 'green');
  }
  
  return valid;
}

async function main() {
  log('\nSupabase Configuration Validator', 'bright');
  log('Validating environment configuration...\n', 'cyan');
  
  let allValid = true;
  
  // Section 1: Required Environment Variables
  logSection('1. Required Supabase Environment Variables');
  
  const requiredVars = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_JWT_SECRET',
  ];
  
  for (const varName of requiredVars) {
    if (!checkEnvVar(varName, true)) {
      allValid = false;
    }
  }
  
  // Section 2: Optional Environment Variables
  logSection('2. Optional Supabase Configuration');
  
  checkEnvVar('SUPABASE_REGION', false);
  checkEnvVar('SUPABASE_STORAGE_BUCKET', false);
  
  // Section 3: Migration Flags
  logSection('3. Migration Configuration Flags');
  
  if (!validateMigrationFlags()) {
    allValid = false;
  }
  
  checkEnvVar('IMAGE_STORAGE_PROVIDER', false);
  checkEnvVar('OUTBOX_CRON_SECRET', false);
  
  // Section 4: Supabase Connection Test
  logSection('4. Supabase Connection Test');
  
  log('  Testing connection to Supabase...', 'cyan');
  const connectionOk = await validateSupabaseConnection();
  if (!connectionOk) {
    allValid = false;
  }
  
  // Section 5: JWT Secret Validation
  logSection('5. JWT Secret Validation');
  
  log('  Validating JWT secret for Realtime auth...', 'cyan');
  if (!validateJWTSecret()) {
    allValid = false;
  }
  
  // Section 6: MongoDB (Required for migration)
  logSection('6. MongoDB Configuration (for migration)');
  
  if (!checkEnvVar('MONGODB_URI', true)) {
    allValid = false;
  }
  
  // Final Summary
  logSection('Validation Summary');
  
  if (allValid) {
    log('  ✓ All checks passed!', 'green');
    log('  ✓ Supabase configuration is valid', 'green');
    log('\n  Next steps:', 'bright');
    log('    1. Apply schema: supabase/migrations/0001_core.sql', 'cyan');
    log('    2. Apply RLS policies: supabase/migrations/0002_rls_and_storage.sql', 'cyan');
    log('    3. Create storage bucket "doosplit" in Supabase Dashboard', 'cyan');
    log('    4. Run migration: npm run migrate:mongodb-to-supabase', 'cyan');
    console.log('');
    process.exitCode = 0;
  } else {
    log('  ✗ Validation failed - fix errors above', 'red');
    log('\n  See documentation:', 'bright');
    log('    docs/SUPABASE_SETUP_GUIDE.md', 'cyan');
    console.log('');
    process.exitCode = 1;
  }
}

// Run validation
main()
  .catch(err => {
    log(`\nFatal error: ${err.message}`, 'red');
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    // Give the event loop a tick to flush output, then force exit
    // to avoid Supabase realtime client keeping the process alive
    setTimeout(() => process.exit(process.exitCode || 0), 100);
  });
