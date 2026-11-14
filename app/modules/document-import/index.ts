import { requireNativeModule } from 'expo';

export const documentImport = requireNativeModule<{
  pdfPageCount(uri: string): Promise<number>;
}>('DocumentImport');
