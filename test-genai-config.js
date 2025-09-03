const { GoogleGenAI } = require('@google/genai');

// Test with different configurations
console.log('Testing GoogleGenAI configuration options...');

try {
  // Basic client
  const basicClient = new GoogleGenAI({ apiKey: 'test-key' });
  console.log('\nBasic client created successfully');
  
  // Try with additional options
  const advancedClient = new GoogleGenAI({ 
    apiKey: 'test-key',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta',
    timeout: 30000
  });
  console.log('Advanced client created successfully');
  
  // Check if baseURL or endpoint options exist
  const clientWithEndpoint = new GoogleGenAI({
    apiKey: 'test-key',
    endpoint: 'https://custom-endpoint.com',
    apiVersion: 'v1beta'
  });
  console.log('Client with custom endpoint created successfully');
  
} catch (error) {
  console.error('Configuration test error:', error.message);
}

// Check constructor parameters
console.log('\nGoogleGenAI constructor:', GoogleGenAI.toString());
