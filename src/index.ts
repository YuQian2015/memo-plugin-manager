import axios from "axios";
import { compareVersions } from "compare-versions";
import fsa from "fs-extra";
import type { HttpsProxyAgent } from "https-proxy-agent";
import fs from "node:fs";
import path from "node:path";
import type { SocksProxyAgent } from "socks-proxy-agent";
import { NodeVM, VMScript } from "vm2";

import { I18n, Manifest, MemoPlugins, Plugin, PluginReturnType } from "./types";
import { calculateFileHash, copyFile, copyFolder, downloadFile, findFileInFolder, generateUUID, getFileNameWithoutExtension, getFilesWithExtension, getValueFromJSON, removeFile, removeFiles, removeFolder, unzipFile } from "./util";

export * from "./types";

/**
 * MemoAI 插件管理器
 *
 * @export
 * @class PluginManager
 */
export default class PluginManager {
  private pluginsCache: Record<string, Record<string, any>> = {}; // 插件使用的缓存信息

  private installedPlugins: PluginReturnType["installedPlugins"] = {};
  private pluginsConfigurations: PluginReturnType["pluginsConfigurations"] = {};
  private installedPluginsManifests: PluginReturnType["installedPluginsManifests"] = {};
  private installedPluginsI18ns: PluginReturnType["installedPluginsI18ns"] = {};
  private importedPlugins: PluginReturnType["importedPlugins"] = {};

  // 不同类型插件的服务提供 Providers
  private pluginProviders: PluginReturnType["pluginProviders"] = [];

  // 一开始默认插件都是空的
  private localPlugins: MemoPlugins = {
    plugins: [],
    versions: {}
  };
  private onlinePlugins: MemoPlugins = {
    plugins: [],
    versions: {}
  };

  private location: string; // 插件安装目录
  private presetLocation: string; // 预置插件安装目录
  private requestUrl: string; // 插件请求地址
  private agent?: HttpsProxyAgent<string> | SocksProxyAgent | undefined;
  private removeDefaultPlugins: boolean = true; // 预置插件安装完成之后自动移除

  constructor({ location, presetLocation, requestUrl, agent, removeDefaultPlugins, onReady }: {
    location: string,
    presetLocation: string,
    requestUrl: string
    agent?: HttpsProxyAgent<string> | SocksProxyAgent | undefined
    removeDefaultPlugins?: boolean,
    onReady?: (ins: PluginManager) => void
  }) {
    if (!location) {
      console.log("插件安装目录不存在");

      throw new Error("插件安装目录不存在");
    }
    this.location = location;
    this.presetLocation = presetLocation;
    this.requestUrl = requestUrl;
    this.agent = agent;
    this.removeDefaultPlugins = !!removeDefaultPlugins;
    this._init()
      .then(() => { onReady && onReady(this); })
      .catch(err => {
        console.error(err);
      });
  }
  private async _init() {
    await this._installDefaultPlugins(this.location);
    this._readLocalPlugins();
  }

  /**
   * 传入本地包中的插件目录，将里面已经存在的插件复制到用户的插件安装目录
   *
   * @param {string} pluginsFolder
   */
  private async _installDefaultPlugins(pluginsFolder: string) {
    const installedPluginsPath = path.resolve(pluginsFolder, "index.json");
    const configurationPath = path.resolve(pluginsFolder, "configuration.json");

    const res = await getFilesWithExtension(this.presetLocation, ".memox");
    if (res.length) {
      console.log("-----------install local plugins");
      let installedPlugins: MemoPlugins = {
        plugins: [],
        versions: {}
      };
      let pluginsConfigurations: Record<string, Record<string, any>> = {};
      if (fs.existsSync(configurationPath)) {
        pluginsConfigurations = JSON.parse(fs.readFileSync(configurationPath, { encoding: "utf-8" })) as Record<string, Record<string, any>>;
      }

      if (fs.existsSync(installedPluginsPath)) {
        installedPlugins = JSON.parse(fs.readFileSync(installedPluginsPath, { encoding: "utf-8" })) as MemoPlugins;
      } else {
        // 如果不存在插件列表文件，则主动创建一个文件 index.json
        fs.writeFileSync(installedPluginsPath, JSON.stringify({
          plugins: [],
          versions: {}
        }, null, 4));
      }

      for (const p of res) {
        const pluginPath = path.resolve(this.presetLocation, p);
        const pluginDest = path.resolve(pluginsFolder, getFileNameWithoutExtension(p));
        console.log(pluginPath);

        await unzipFile(pluginPath, pluginDest);

        const data: Manifest = JSON.parse(fs.readFileSync(path.resolve(pluginDest, "manifest.json"), { encoding: "utf-8" }));

        const plugin: Plugin = {
          "file": path.resolve(pluginsFolder, `${data.pluginId}@${data.version}/index.js`),
          "pluginId": data.pluginId,
          "version": data.version,
          "version_name": data.version_name,
          "title": data.title,
          "type": data.type,
          "description": data.description,
          "category": data.category,
          "platforms": data.platforms,
          "arch": data.arch,
          "icon": path.resolve(pluginsFolder, `${data.pluginId}@${data.version}/icon.svg`),
          "link": data.link,
          "author": data.author,
          "homepage": data.source,
          "source": data.source
        };

        // 如果检测插件ID已经存在配置，需要考虑是否继承配置，
        // 需要判断如果当前插件的版本号大于已有插件的版本号，则进行继承
        if (installedPlugins.versions[plugin.pluginId]) {
          if (compareVersions(plugin.version, installedPlugins.versions[plugin.pluginId]) === 1) {
            pluginsConfigurations[`${plugin.pluginId}@${plugin.version}`] = pluginsConfigurations[`${plugin.pluginId}@${installedPlugins.versions[plugin.pluginId]}`] || {};
          }
        }

        if (installedPlugins.plugins && installedPlugins.versions) {
          // 如果待安装的版本高于已安装的版本，则进行覆盖，如果没有安装插件，也需要进行安装
          if (!installedPlugins.versions[plugin.pluginId] || compareVersions(plugin.version, installedPlugins.versions[plugin.pluginId]) !== -1) {
            const index = installedPlugins.plugins.findIndex((pl: Plugin) => pl.pluginId === plugin.pluginId);
            console.log(plugin.pluginId, plugin.version);
            if (index > -1) {
              installedPlugins.plugins.splice(index, 1, plugin);
            } else {
              installedPlugins.plugins.unshift(plugin);
            }
            installedPlugins.versions[plugin.pluginId] = plugin.version;
          }
        }

      }

      console.log("-----------finished");

      fs.writeFileSync(installedPluginsPath, JSON.stringify(installedPlugins, null, 4));
      fs.writeFileSync(configurationPath, JSON.stringify(pluginsConfigurations, null, 4));

      if (this.removeDefaultPlugins) {
        removeFiles(res.map(p => path.resolve(this.presetLocation, p)));
      }
    }
  }

  /**
   * 读取本地插件目录里面的所有插件信息
   * 
   */
  private _readLocalPlugins(): MemoPlugins {
    console.log("read local plugins");

    const configurationPath = path.resolve(this.location, "configuration.json");
    const cachePath = path.resolve(this.location, "cache.json");
    const pluginsPath = path.resolve(this.location, "plugins.json");

    // 第一步：获取线上插件列表
    // 用户首次启动时，可能安装包内预置了插件列表，因此需要将预置插件移动到用户安装插件的目录
    const presetPluginsPath = path.resolve(this.presetLocation, "plugins.json");

    // 如果预置插件列表存在，则使用预置插件列表
    if (fs.existsSync(presetPluginsPath)) {
      copyFile(presetPluginsPath, pluginsPath, "plugins.json").then(() => {
        this.onlinePlugins = JSON.parse(fs.readFileSync(presetPluginsPath, { encoding: "utf-8" })) as MemoPlugins;
        if (process.env.NODE_ENV !== "development") {
          removeFile(presetPluginsPath);
        }
      });
    } else if (fs.existsSync(pluginsPath)) {
      this.onlinePlugins = JSON.parse(fs.readFileSync(pluginsPath, { encoding: "utf-8" })) as MemoPlugins;
    }
    this.getOnlinePlugins({ agent: this.agent }).then((res) => {
      console.log("get online plugins");
      this.onlinePlugins = res;
    });

    // 第二步：获取本地安装插件列表
    const data = JSON.parse(fs.readFileSync(path.resolve(this.location, "index.json"), { encoding: "utf-8" })) as MemoPlugins;
    data.plugins.forEach((plugin) => {
      this.installedPlugins[plugin.pluginId] = plugin;
    });

    // 第三步：获取每个插件的 Manifests 和 I18n，并且将插件分类
    for (const key in this.installedPlugins) {
      const manifestFolderPath = path.resolve(this.location, this.installedPlugins[key].pluginId + "@" + this.installedPlugins[key].version);
      const manifestPath = path.resolve(manifestFolderPath, "manifest.json");
      if (!fs.existsSync(manifestFolderPath) || !fs.existsSync(manifestPath)) {
        console.log("plugins or manifest exists", manifestFolderPath);
        const version = this.installedPlugins[key].version;
        delete this.installedPlugins[key];
        delete this.localPlugins.versions[key];
        delete this.installedPluginsManifests[key];
        delete this.installedPluginsI18ns[key];
        delete this.pluginsConfigurations[`${key}@${version}`];
        delete data.versions[key];
        const i = data.plugins.findIndex((p) => p.pluginId === key);
        if (i >= 0) {
          data.plugins.splice(i, 1);
        }

        continue;
      }
      const i18nPath = path.resolve(this.location, this.installedPlugins[key].pluginId + "@" + this.installedPlugins[key].version, "i18n.json");
      const manifest: Manifest = JSON.parse(fs.readFileSync(manifestPath, { encoding: "utf-8" }));
      const i18n: I18n = fs.existsSync(i18nPath) ? JSON.parse(fs.readFileSync(i18nPath, { encoding: "utf-8" })) : {
        en: {}, zh: {}, zh_tw: {}, ja: {}, ko: {}, es: {}, de: {}, it: {}
      };
      this.installedPluginsManifests[key] = manifest;
      this.installedPluginsI18ns[key] = i18n;

      this.pluginProviders.push({
        ...manifest.provider,
        pluginId: this.installedPlugins[key].pluginId,
        type: this.installedPlugins[key].type
      });
    }
    console.log("installedPlugins", this.pluginProviders);

    // 第四步：获取所有插件的配置
    // 判断配置文件存在的话，读取出来设置到 this.pluginsConfigurations 中
    if (fs.existsSync(configurationPath)) {
      const configurations = JSON.parse(fs.readFileSync(configurationPath, { encoding: "utf-8" })) as Record<string, any>;
      for (const key in configurations) {
        this.pluginsConfigurations[key] = configurations[key];
      }
    }

    // 第五步：读取所有插件缓存，判断插件缓存文件存在的话，读取出来设置到 this.pluginsCache 中
    if (fs.existsSync(cachePath)) {
      const cache = JSON.parse(fs.readFileSync(cachePath, { encoding: "utf-8" })) as Record<string, Record<string, any>>;
      for (const key in cache) {
        this.pluginsCache[key] = cache[key];
      }
    }
    this.localPlugins = data;

    // 返回本地安装的插件列表
    return data;
  }

  async getOnlinePlugins({ agent }: {
    agent?: HttpsProxyAgent<string> | SocksProxyAgent | undefined
  }): Promise<MemoPlugins> {
    const response = await axios.get(this.requestUrl, {
      headers: { "Content-Type": "application/json" },
      httpsAgent: agent
    });
    const pluginsPath = path.resolve(this.location, "plugins.json");

    const res = response.data;
    if (res && res.success && res.data) {
      const versions: Record<string, string> = {};

      (res.data || []).forEach((plugin: Plugin) => {
        versions[plugin.pluginId] = plugin.version;
      });

      const data = {
        plugins: res.data || [],
        versions
      };

      fs.writeFileSync(pluginsPath, JSON.stringify(data, null, 4));

      return data as MemoPlugins;
    } else if (fs.existsSync(pluginsPath)) {
      return JSON.parse(fs.readFileSync(pluginsPath, { encoding: "utf-8" }));
    } else {
      return {
        plugins: [],
        versions: {}
      };
    }
  }

  async installPlugins(pluginsPacks: { path: string }[], setting?: any) {
    const uuid = generateUUID();
    const dist = path.resolve(this.location, uuid);
    await fsa.ensureDir(dist, { mode: 0o777 });
    await unzipFile(pluginsPacks[0].path, dist);
    const manifest = await findFileInFolder(dist, "manifest.json");
    if (typeof manifest === "string") {
      const data: Manifest = JSON.parse(fs.readFileSync(path.resolve(manifest, "manifest.json"), { encoding: "utf-8" }));
      const plugin: Plugin = {
        "file": path.resolve(this.location, `${data.pluginId}@${data.version}/index.js`),
        "pluginId": data.pluginId,
        "version": data.version,
        "version_name": data.version_name,
        "title": data.title,
        "type": data.type,
        "description": data.description,
        "category": data.category,
        "platforms": data.platforms,
        "arch": data.arch,
        "icon": path.resolve(this.location, `${data.pluginId}@${data.version}/icon.svg`),
        "link": data.link,
        "author": data.author,
        "homepage": data.source,
        "source": data.source
      };

      await copyFolder(manifest, path.resolve(this.location, data.pluginId + "@" + data.version));
      await removeFolder(dist);
      const i18nPath = path.resolve(this.location, data.pluginId + "@" + data.version, "i18n.json");
      const i18n: I18n = fs.existsSync(i18nPath) ? JSON.parse(fs.readFileSync(i18nPath, { encoding: "utf-8" })) : {
        en: {}, zh: {}, zh_tw: {}, ja: {}, ko: {}, es: {}, de: {}, it: {}
      };
      const pluginIndex = this.localPlugins.plugins.findIndex(p => p.pluginId === plugin.pluginId);
      let oldPluginsConfigurations = {};
      if (pluginIndex >= 0) {
        const oldPlugin = JSON.parse(JSON.stringify(this.localPlugins.plugins[pluginIndex]));
        this.localPlugins.plugins[pluginIndex] = plugin;
        oldPluginsConfigurations = this.pluginsConfigurations[`${oldPlugin.pluginId}@${oldPlugin.version}`] || {};
      } else {
        this.localPlugins.plugins.unshift(plugin);
      }
      this.localPlugins.versions[plugin.pluginId] = plugin.version;
      this.installedPlugins[plugin.pluginId] = plugin;
      this.installedPluginsManifests[plugin.pluginId] = data;
      this.installedPluginsI18ns[plugin.pluginId] = i18n;
      const inheritPluginsConfigurations: Record<string, any> = {};
      if (data.configuration && data.configuration.length > 0) {
        data.configuration.forEach(c => {
          if (c.inherit) {
            const value = getValueFromJSON(setting, c.inherit);
            inheritPluginsConfigurations[c.key] = value;
          }
        });
      }
      this.pluginsConfigurations[`${data.pluginId}@${data.version}`] = { ...inheritPluginsConfigurations, ...oldPluginsConfigurations };
      const i = this.pluginProviders.findIndex((p) => p.pluginId === plugin.pluginId);
      if (i < 0) {
        this.pluginProviders.push({
          ...data.provider,
          pluginId: plugin.pluginId,
          type: plugin.type
        });
      }
      fs.writeFileSync(path.resolve(this.location, "index.json"), JSON.stringify(this.localPlugins, null, 4));
      fs.writeFileSync(path.resolve(this.location, "configuration.json"), JSON.stringify(this.pluginsConfigurations, null, 4));

      const messageData = this.getAllData();

      return messageData;
    }
  }

  async uninstallPlugin(pluginId: Plugin["pluginId"]) {
    const list = this.localPlugins.plugins;
    const index = list.findIndex((p: Plugin) => p.pluginId === pluginId);
    let deletedPlugin: Plugin | undefined;
    if (index >= 0) {
      deletedPlugin = this.localPlugins.plugins.splice(index, 1)[0];
    }
    delete this.localPlugins.versions[pluginId];
    delete this.installedPlugins[pluginId];
    delete this.installedPluginsManifests[pluginId];
    delete this.installedPluginsI18ns[pluginId];
    if (deletedPlugin) {
      delete this.pluginsConfigurations[`${deletedPlugin.pluginId}@${deletedPlugin.version}`];
    }
    const i = this.pluginProviders.findIndex((p) => p.pluginId === pluginId);
    if (i >= 0) {
      this.pluginProviders.splice(i, 1);
    }
    fs.writeFileSync(path.resolve(this.location, "index.json"), JSON.stringify(this.localPlugins, null, 4));
    fs.writeFileSync(path.resolve(this.location, "configuration.json"), JSON.stringify(this.pluginsConfigurations, null, 4));
    if (deletedPlugin) {
      await removeFolder(path.resolve(this.location, `${deletedPlugin.pluginId}@${deletedPlugin.version}`));
    }
    const data = this.getAllData();

    return data;
  }

  async saveConfiguration(pluginId: Plugin["pluginId"], data: Record<string, any>) {
    if (this.installedPlugins[pluginId]) {
      this.pluginsConfigurations[`${pluginId}@${this.installedPlugins[pluginId].version}`] = data;
      fs.writeFileSync(path.resolve(this.location, "configuration.json"), JSON.stringify(this.pluginsConfigurations, null, 4));
    }

    return this.getAllData();
  }

  async refreshOnlinePlugins({ agent }: {
    agent?: HttpsProxyAgent<string> | SocksProxyAgent | undefined
  }) {
    this.onlinePlugins = await this.getOnlinePlugins({ agent });
    const data = this.getAllData();

    return data;
  }

  async installOnlinePlugins(
    pluginId: Plugin["pluginId"],
    { agent }: { agent?: HttpsProxyAgent<string> | SocksProxyAgent | undefined }
  ) {

    return new Promise<PluginReturnType>((resolve, reject) => {
      const online = this.onlinePlugins.plugins.find((p) => p.pluginId === pluginId);
      if (online) {
        console.log("Download plugin:", online.link);
        // const filename = getFileNameFromUrl(online.link);
        // const savePath = path.resolve(this.location, filename);
        const savePath = path.resolve(this.location, "_download");
        downloadFile({
          url: online.link,
          savePath,
          startCallback: () => {
            console.log("Download started");
          },
          progressCallback: (progress) => {
            console.log(`Download progress: ${progress}%`);
          },
          completionCallback: async (localPath) => {
            console.log(`Download completed. File saved at: ${localPath}`);
            const hash = await calculateFileHash(localPath);
            console.log("Check hash:", hash, online.hash);
            // if (hash === online.hash) {
            await this.installPlugins([{ path: localPath }]);
            resolve(this.getAllData());
            // }
          },
          errorCallback: (error) => {
            reject(error);
          },
          agent
        });
      }
    });
  }

  async testPlugin(pluginId: Plugin["pluginId"]) {
    const testPlugin = this.installedPlugins[pluginId];
    if (testPlugin) {
      // const appFolder: AppFolder = checkAppFolder();
      // const pluginFile = path.resolve(this.location, testPlugin.file)
      // const pluginsString = fs.readFileSync(pluginFile, { encoding: 'utf-8' })

      // // 在虚拟机中运行代码
      // const { OpenAITranslate, config } = createTranslateVM(pluginsString, pluginFile, testPlugin.pluginId);

      // const setting: AppSettings = getSetting()
      // const agent = getHttpProxy();
      // const ins = setting.openAI && OpenAITranslate.create({
      //   apiKey: setting.openAI.apiKey,
      //   model: setting.openAI.model,
      //   host: setting.openAI?.host ? setting.openAI?.host : undefined,
      //   fetchOptions: { agent },
      //   onStart: () => {
      //     console.log('start');
      //   },
      //   onMessage: (data) => {
      //     console.log('start', data);
      //   },
      //   onComplete: () => {
      //     console.log('onComplete');
      //   }
      // })
      // ins.translateSegment(
      //   {
      //     content: [
      //       {
      //         st: '00:00:00.000',
      //         et: '00:00:00.000',
      //         text: '你是一个很可爱的人'
      //       }
      //     ],
      //     targetLang: {
      //       value: 'zh',
      //       label: '简体中文'
      //     }
      //   }
      // );
    }
  }

  getPluginProviders() {
    return this.pluginProviders;
  }

  getInstalledPlugins() {
    return this.installedPlugins;
  }

  /**
   * 获取本地插件的所有配置
   */
  getPluginsConfigurations() {
    return this.pluginsConfigurations;
  }

  getInstalledPluginsManifests() {
    return this.installedPluginsManifests;
  }

  private _loadLocalPlugin(pluginsString: string, pluginFile: string, pluginId?: string): any {
    const globalObject = {
      pluginCache: {
        get: (key: string) => {
          return (this.pluginsCache[pluginId!] || {})[key];
        },
        set: (key: string, value: any) => {
          this.pluginsCache[pluginId!] = this.pluginsCache[pluginId!] || {};
          this.pluginsCache[pluginId!][key] = value;
          fs.writeFileSync(path.resolve(this.location, "cache.json"), JSON.stringify(this.pluginsCache, null, 4));
        }
      }
    };
    (global as any)["pluginCache"] = globalObject.pluginCache;

    // FIXME: 需要考虑不同版本加载的情况，因此还需要额外增加一个版本号
    if (pluginId && this.importedPlugins[pluginId]) {
      console.log("require cached plugin module " + pluginFile);

      return this.importedPlugins[pluginId];
    }

    if (pluginId && this.installedPluginsManifests[pluginId].importType === "module") {
      console.log("require plugin module " + pluginFile);
      const p = require(pluginFile);
      this.importedPlugins[pluginId] = p;

      return p;
    } else {

      const vm = new NodeVM({
        require: {
          // external: true,
          builtin: ["url", "http", "https", "stream", "punycode", "zlib", // node-fetch 需要用到的依赖
            "crypto", "buffer", "util", "path"],
          // builtin: ['*'],
          // builtin: ['fs', 'path', 'stream', 'http', 'https', 'url', 'punycode'],
          // external: {
          //   modules: ['openai'],
          //   // 将openai库映射到外部的openai模块
          //   mappings: {
          //     openai,
          //   },
          // },
          // external: ['openai'], // 暴露openai模块给沙盒
          // import: ['openai'],
          mock: {
            // 'http-errors': require('http-errors'), // http-errors
          },
          context: "sandbox" // 设置模块的上下文为沙盒
        }
      });
      const script = new VMScript(pluginsString, pluginFile);
      // const m = vm.run(pluginsString);
      // console.log(script);

      // 在沙箱中注入AbortController类
      vm.freeze(AbortController, "AbortController");
      vm.freeze(TextDecoder, "TextDecoder");
      // 在沙盒中注入process.stderr
      vm.setGlobal("process", process);
      vm.setGlobal("pluginCache", globalObject.pluginCache);

      // 在虚拟机中运行代码
      return vm.run(script);
    }

  }

  loadPlugin(pluginId: string) {
    const selectedPlugin = this.installedPlugins[pluginId];
    const pluginFile = path.resolve(this.location, selectedPlugin.file);
    const pluginsString = fs.readFileSync(pluginFile, { encoding: "utf-8" });

    const plugin = this._loadLocalPlugin(pluginsString, pluginFile, pluginId);

    return plugin;
  }

  getAllData(): PluginReturnType {
    return {
      localPlugins: this.localPlugins,
      onlinePlugins: this.onlinePlugins,
      installedPlugins: this.installedPlugins,
      installedPluginsI18ns: this.installedPluginsI18ns,
      installedPluginsManifests: this.installedPluginsManifests,
      pluginProviders: this.pluginProviders,
      pluginsConfigurations: this.pluginsConfigurations,
      importedPlugins: this.importedPlugins
    };
  }
}

// const pluginManager = new PluginManager({
//   location: 'F:\\Develop\\MemoAITranslate\\New folder',
//   presetLocation: "F:\\Develop\\Pemo\\resources\\plugins",
//   requestUrl: "https://integrations.memo.ac/plugins",
//   removeDefaultPlugins: false,
//   onReady: () => {
//     const pluginIns = pluginManager.loadPlugin('memo-plugin-translate-microsoft')
//     console.log(pluginIns);
//     const translator = new pluginIns.default()
//     translator.translate({
//         content: [{
//           st: '0',
//           et: '0',
//           text: '你好'
//         }, {
//           st: '0',
//           et: '0',
//           text: '你好'
//         }],
//         targetLang: {
//           label: '英文',
//           value: 'en'
//         }
//       }).then(res => {
//         console.log(res);
//       })
//   }
// })
