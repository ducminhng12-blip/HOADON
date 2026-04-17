import { GoogleGenAI, Type } from "@google/genai";
import { InvoiceData } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });

export async function extractInvoiceData(imageBase64: string): Promise<InvoiceData> {
  const base64Data = imageBase64.split(',')[1];
  
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      {
        parts: [
          {
            text: "Đây là phần đầu (header) của hóa đơn điện tử Petrolimex. Hãy trích xuất các thông tin định danh quan trọng sau: \n1. Ngày hóa đơn: Tìm dòng 'Ngày... tháng... năm...' và trả về định dạng YYYYMMDD.\n2. Số hóa đơn: Tìm mục 'Số' hoặc 'No.' (giữ nguyên các số 0 ở đầu).\n3. Ký hiệu hóa đơn: Tìm mục 'Ký hiệu' hoặc 'Serial'."
          },
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: base64Data
            }
          }
        ]
      }
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          date: {
            type: Type.STRING,
            description: "Invoice date in YYYYMMDD format. Example: 20260207"
          },
          invoiceNumber: {
            type: Type.STRING,
            description: "Invoice number (Số hóa đơn). Example: 43499"
          },
          serial: {
            type: Type.STRING,
            description: "Serial number (Ký hiệu). Example: 1K26TXN"
          }
        },
        required: ["date", "invoiceNumber", "serial"]
      }
    }
  });

  const text = response.text;
  if (!text) throw new Error("Could not extract data from the invoice image.");
  
  try {
    return JSON.parse(text) as InvoiceData;
  } catch (err) {
    console.error("Failed to parse Gemini response:", text);
    throw new Error("Invalid response format from AI.");
  }
}
