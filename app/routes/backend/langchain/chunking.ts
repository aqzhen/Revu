import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";

export async function chunk_string(chunkString : string) {
    console.log(chunkString);
    const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 128,
        chunkOverlap: 20
    });
    const chunks = await splitter.createDocuments([chunkString])
    const res = chunks.map(item => item.pageContent);
    return res;
}