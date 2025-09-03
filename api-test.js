const { GoogleGenAI } = require('@google/genai');

console.log('Testing @google/genai API structure...');

try {
  const client = new GoogleGenAI({ apiKey: 'test-key' });
  
  console.log('Client created successfully');
  console.log('Client keys:', Object.keys(client));
  console.log('Client prototype:', Object.getOwnPropertyNames(Object.getPrototypeOf(client)));
  
  // Test different method names
  const methods = ['generateContent', 'generate', 'models', 'chat', 'completion'];
  
  methods.forEach(method => {
    if (client[method]) {
      console.log(`✅ Method exists: ${method} (type: ${typeof client[method]})`);
    } else {
      console.log(`❌ Method missing: ${method}`);
    }
  });
  
  // Check if models property exists and its methods
  if (client.models) {
    console.log('models object keys:', Object.keys(client.models));
    console.log('models object methods:', Object.getOwnPropertyNames(client.models));
  }
  
} catch (error) {
  console.error('Error:', error.message);
}
