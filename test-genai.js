const { GoogleGenAI } = require('@google/genai');

try {
  const client = new GoogleGenAI({ apiKey: 'test' });
  console.log('GoogleGenAI instance methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(client)));
  console.log('GoogleGenAI constructor methods:', Object.getOwnPropertyNames(client));
} catch (error) {
  console.error('Error:', error.message);
}
