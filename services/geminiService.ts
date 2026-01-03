
import { GoogleGenAI } from "@google/genai";
import { MODELS } from "../constants";
import { Resolution } from "../types";

export class GeminiService {
  private static getClient(apiKey: string) {
    return new GoogleGenAI({ apiKey: apiKey });
  }

  static async analyzeCharacter(apiKey: string, imageBase64: string): Promise<string> {
    const ai = this.getClient(apiKey);
    
    try {
      const response = await ai.models.generateContent({
        model: MODELS.ANALYSIS,
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: 'image/png',
                data: imageBase64,
              },
            },
            {
              text: `Analyze the character identity in this image for a LoRA training dataset. 
              EXCLUDE POSE AND ENVIRONMENT. Use strictly technical, literal language.
              
              CRITICAL: DO NOT hallucinate minor skin marks, moles, freckles, or temporary blemishes unless they are extremely prominent and defining permanent character features. Focus on clear, repeatable traits.

              Focus exclusively on: 
              1. Biological/Physical features: Face shape (e.g., oval, heart), precise eye shape, lip thickness, skin tone.
              2. Hair: BE PRECISE about length relative to body (e.g., 'bottom of ears', 'touching shoulders', 'mid-back'). Describe texture (straight, wavy, curly), and exact base color + highlights.
              3. Body build: Describe shoulder width, waist ratio, and limb tone.
              
              Respond with a factual identity profile. Formatting: HAIR: [details]. FACE: [details]. BODY: [details].`
            }
          ]
        }
      });

      return response.text || "A detailed character profile.";
    } catch (error: any) {
      if (error.message?.includes("Requested entity was not found")) {
        throw new Error("API_KEY_EXPIRED");
      }
      throw error;
    }
  }

  static async generateCharacterImage(
    apiKey: string,
    imageBase64: string,
    prompt: string,
    resolution: Resolution = '1K',
    aspectRatio: "1:1" | "3:4" | "4:3" | "9:16" | "16:9" = "1:1"
  ): Promise<string> {
    const ai = this.getClient(apiKey);
    
    try {
      const cleanBase64 = imageBase64.includes('base64,') 
        ? imageBase64.split('base64,')[1] 
        : imageBase64;

      const response = await ai.models.generateContent({
        model: MODELS.IMAGE,
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: 'image/png',
                data: cleanBase64,
              },
            },
            {
              text: prompt
            },
          ],
        },
        config: {
          imageConfig: {
            aspectRatio: aspectRatio,
            imageSize: resolution
          },
        },
      });

      if (!response.candidates || response.candidates.length === 0) {
        throw new Error("The model did not return any candidates.");
      }

      const candidate = response.candidates[0];
      const parts = candidate.content?.parts;
      if (!parts || parts.length === 0) {
        throw new Error("Generation blocked by safety filters or empty response.");
      }

      for (const part of parts) {
        if (part.inlineData) {
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }

      throw new Error("No image data found in the response parts.");
    } catch (error: any) {
      if (error.message?.includes("Requested entity was not found")) {
        throw new Error("API_KEY_EXPIRED");
      }
      throw error;
    }
  }
}
