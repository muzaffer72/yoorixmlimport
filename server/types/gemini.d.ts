// Temporary type definitions for Google Generative AI
declare module "@google/generative-ai" {
  export interface GenerateContentResult {
    response: {
      text(): string;
    };
  }

  export interface GenerativeModel {
    generateContent(prompt: string): Promise<GenerateContentResult>;
  }

  export class GoogleGenerativeAI {
    constructor(apiKey: string);
    getGenerativeModel(config: { model: string; generationConfig?: any }): GenerativeModel;
  }
}
