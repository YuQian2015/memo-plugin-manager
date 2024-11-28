import axios from "axios";
import * as crypto from "crypto";
import { default as fsa } from "fs-extra";
import { HttpsProxyAgent } from "https-proxy-agent";
import fs from "node:fs";
import path from "path";
import { SocksProxyAgent } from "socks-proxy-agent";
// @ts-ignore
import unzip from "unzip-stream";


/**
 * 从一个路径中获取文件大小
 *
 *
 * @export
 * @param {string} filepath
 * @return {*}  {number}
 */
export function getFileSizeInBytes(filepath: string): number {
  const stats = fs.statSync(filepath);

  return stats.size;
}

/**
 * 复制文件
 *
 * @export
 * @param {string} from
 * @param {string} to
 * @param {string} name
 * @param {(percent: number) => any} [onProgress]
 * @return {*} 
 */
export async function copyFile(from: string, to: string, name: string, onProgress?: (percent: number) => any) {
  const fileSize = getFileSizeInBytes(from);
  let copySize = 0;

  return new Promise((resolve, reject) => {
    if (fs.existsSync(to)) {
      resolve(name);

      return;
    }
    const rs = fs.createReadStream(from, { highWaterMark: 128 * 1024 });
    const ws = fs.createWriteStream(to);
    rs.on("close", () => {
      resolve(name);
    });
    rs.on("data", (data) => {
      copySize += data.length;
      onProgress && onProgress(Math.floor(copySize / fileSize * 10000) / 100);
    });
    ws.on("error", (err: any) => {
      console.log(err);
      reject(false);
    });
    rs.pipe(ws);
  });
}

/**
 * 移除指定本地文件
 *
 * @export
 * @param {string} file
 * @return {*}  {Promise<void>}
 */
export function removeFile(file: string): Promise<void> {
  return fsa.remove(file);
}

/**
 * 从本地路径移除一个文件夹
 *
 * @export
 * @param {string} folderPath
 * @return {*}  {Promise<void>}
 */
export function removeFolder(folderPath: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    fsa.remove(folderPath, err => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}


/**
 * 将zip解压到指定文件夹
 *
 * @param {string} zipFilePath
 * @param {string} outputFolderPath
 * @param {(progress: number) => void} progressCallback
 * @return {*}  {Promise<void>}
 */
// export function unzipFile(zipFilePath: string, outputFolderPath: string, progressCallback?: (progress: number) => void): Promise<void> {
//   // TODO: 增加解压进度

//   // let totalEntries = 0;
//   // let extractedEntries = 0;

//   return new Promise((resolve, reject) => {
//     const readStream = fs.createReadStream(zipFilePath);
//     const writeStream = unzipper.Extract({ path: outputFolderPath });

//     readStream.pipe(writeStream);

//     readStream.on('error', reject);
//     writeStream.on('error', reject);
//     writeStream.on('close', resolve);

//     // writeStream.on('entry', () => {
//     //   totalEntries++;
//     // });

//     // writeStream.on('extract', () => {
//     //   extractedEntries++;
//     //   console.log(extractedEntries, totalEntries);

//     //   const progress = Math.floor((extractedEntries / totalEntries) * 100);
//     //   progressCallback(progress);
//     // });
//   });
// }

export function unzipFile(zipFilePath: string, outputFolderPath: string,
  // progressCallback?: (progress: number) => void
): Promise<void> {
  // TODO: 增加解压进度
  return new Promise((resolve, reject) => {
    const readStream = fs.createReadStream(zipFilePath);

    fsa.ensureDirSync(outputFolderPath);
    readStream
      .pipe(unzip.Extract({ path: outputFolderPath }))
      .on("error", reject)
      .on("close", resolve);
  });
}

/**
 * 遍历一个文件夹并查找指定文件名的文件，如果找到，则返回文件所在的文件夹地址
 *
 * @export
 * @param {string} folderPath
 * @param {string} fileName
 * @return {*}  {(Promise<string | boolean>)}
 * 
 * const folderPath = '/path/to/folder';
 * const fileName = 'example.txt';
 * 
 * findFileInFolder(folderPath, fileName)
 * 
 * .then((result) => {
 *   if (result) {
 *     console.log(`文件找到，位于文件夹：${result}`);
 *   } else {
 *     console.log('文件未找到');
 *   }
 * })
 * 
 * .catch((err) => {
 *   console.error('发生错误：', err);
 * });
 */
export async function findFileInFolder(folderPath: string, fileName: string): Promise<string | boolean> {
  return new Promise((resolve, reject) => {
    fs.readdir(folderPath, (err, files) => {
      if (err) {
        reject(err);

        return;
      }

      let foundPath: string | boolean = false;

      const checkNextFile = async (index: number) => {
        if (index >= files.length) {
          resolve(foundPath);

          return;
        }

        const file = files[index];
        const filePath = path.join(folderPath, file);

        fs.stat(filePath, async (err, fileStat) => {
          if (err) {
            reject(err);

            return;
          }

          if (fileStat.isDirectory()) {
            const result = await findFileInFolder(filePath, fileName);
            if (result) {
              foundPath = result;
              resolve(foundPath);

              return;
            }
          } else if (fileStat.isFile() && file === fileName) {
            foundPath = folderPath;
            resolve(foundPath);

            return;
          }

          await checkNextFile(index + 1);
        });
      };

      checkNextFile(0);
    });
  });
}

/**
 * 复制一个文件夹到另一个文件夹
 * 调用示例
 * copyFolder('path/to/source/folder', 'path/to/destination/folder');
 * @export
 * @param {string} source
 * @param {string} destination
 */
export async function copyFolder(source: string, destination: string) {
  try {
    await fsa.copy(source, destination);
    console.log("文件夹复制成功！");
  } catch (error) {
    console.error("文件夹复制失败：", error);
  }
}

export function generateUUID() {
  let d = new Date().getTime();
  const uuid = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
    /[xy]/g,
    function (c) {
      const r = (d + Math.random() * 16) % 16 | 0;
      d = Math.floor(d / 16);

      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    }
  );

  return uuid;
}


// const json = {
//   name: 'John',
//   address: {
//     city: 'New York',
//     street: '123 Main St'
//   }
// };

// const value1 = getValueFromJSON(json, 'name'); // 返回 'John'
// const value2 = getValueFromJSON(json, 'address.city'); // 返回 'New York'
// const value3 = getValueFromJSON(json, 'address.zipCode'); // 返回 undefined
export function getValueFromJSON(json: any, valuePath: string): any {
  const keys = valuePath.split("."); // 将路径按照点号分割成数组

  let current = json;
  for (const key of keys) {
    if (current && typeof current === "object" && key in current) {
      current = current[key]; // 更新当前值为下一层级的值
    } else {
      return undefined; // 如果路径中的某个层级不存在或值为undefined，则返回undefined
    }
  }

  return current; // 返回找到的值
}


// 从指定的URL下载文件并存储到指定目录，支持开始回调，进度回调，完成回调。
// 完成时返回下载到的本地地址，下载过程中使用.downloading后缀，下载完成自动变更会下载的文件的url上的缀名
// const url = 'https://example.com/file.txt';
// const savePath = 'downloads/file.txt';
export async function downloadFile({ url, savePath, agent, startCallback, progressCallback, completionCallback, errorCallback }: {
  url: string,
  savePath: string,
  startCallback?: () => void,
  progressCallback?: (progress: number) => void,
  completionCallback?: (localPath: string) => void,
  errorCallback?: (error: any) => void
  agent?: HttpsProxyAgent<string> | SocksProxyAgent | undefined
}): Promise<void> {
  try {
    const response = await axios({
      url,
      method: "GET",
      responseType: "stream",
      httpsAgent: agent,
      timeout: 5000, // 设置超时时间为5秒
    });

    // const extension = path.extname(url);
    const tempFilePath = `${savePath}.downloading`;

    const writer = fs.createWriteStream(tempFilePath);

    response.data.pipe(writer);

    if (startCallback) {
      startCallback();
    }

    let bytesDownloaded = 0;
    let totalSize: number | null = null;

    response.data.on("data", (chunk: Buffer) => {
      bytesDownloaded += chunk.length;

      if (progressCallback && totalSize) {
        const progress = (bytesDownloaded / totalSize) * 100;
        progressCallback(progress);
      }
    });

    response.data.on("response", (res: any) => {
      totalSize = parseInt(res.headers["content-length"], 10);
    });

    writer.on("finish", () => {
      fs.rename(tempFilePath, savePath, (err) => {
        if (err) {
          throw err;
        } else {
          if (completionCallback) {
            completionCallback(savePath);
          }
        }
      });
    });
  } catch (error) {
    if (axios.isAxiosError(error) && error.code === "ECONNABORTED") {
      // 处理请求超时错误
      // 执行相应的操作
      console.log("请求超时：", error);
      errorCallback?.(error);

    } else {
      // 处理其他网络错误
      // 执行相应的操作
      console.log("网络错误：", error);
      errorCallback?.(error);
    }
  }
}

export function calculateFileHash(filePath: string) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const input = fs.createReadStream(filePath);

    input.on("error", reject);
    hash.on("readable", () => {
      const data = hash.read();
      if (data) {
        resolve(data.toString("hex"));
      }
    });

    input.pipe(hash);
  });
}

/**
 * 获取一个文件夹中指定后缀的文件列表
 *
 * @export
 * @param {string} directory
 * @param {string} extension
 * @return {*}  {Promise<string[]>}
 */
export async function getFilesWithExtension(directory: string, extension: string): Promise<string[]> {
  const files = await fsa.readdir(directory);
  const filteredFiles = files.filter(file => path.extname(file) === extension);

  return filteredFiles;
}

/**
 * 从本地文件路径获取文件名，不包含后缀
 *
 * @param {string} filePath
 * @return {*}  {string}
 */
export function getFileNameWithoutExtension(filePath?: string): string {
  if (!filePath) {
    return "";
  }
  const { name } = path.parse(filePath);

  return name;
}

/**
 * 移除指定数组中的所有本地文件
 *
 * @param {string[]} fileList
 * @return {*}  {Promise<void[]>}
 */
export function removeFiles(fileList: string[]): Promise<void[]> {
  return Promise.all(
    fileList.map(filePath => {
      return fsa.remove(filePath)
        .then(() => {
          console.log(`remove: ${filePath} removed successfully`);
        })
        .catch(error => {
          console.error(`Error removing ${filePath}:`, error);
        });
    })
  );
}
