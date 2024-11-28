export interface Plugin {
  file: string; // 插件的入口文件，通常是打包完成之后的 index.js
  pluginId: string; // 插件在整个应用的唯一ID，命名为 “应用-plugin-类别-服务商” 如：memo-plugin-translate-ollama
  version: string; // 插件版本, 如：1.0.0
  version_name: string; // 插件版本名称，如：beta，alpha，release
  title: string; // 插件标题
  type: "translate" | "summarize" | "download" | "tts" | "transcription"; // 插件类别
  description: string; // 插件描述
  category: string; // 插件分类
  platforms: string[]; // 插件支持的平台，数组: [ "win32", "darwin" ]
  arch: string[]; // 插件支持的架构，如： "arm64", "x64"
  icon: string; // 插件的图标，线上PNG地址或本地SVG。如： "/Users/.../memo-plugin-translate-claude@1.0.3/icon.svg"
  link: string; // 插件的下载链接，如：https://plugins.memo.ac/translate/memo-plugin-translate-volctrans@1.0.2.memox
  author: string; // 插件作者
  homepage: string; // 插件主页
  source: string; // 插件源代码地址
  hash?: string; // 插件的hash值
}

// 线上或者本地安装的插件，都是以这个结构存储的JSON文件
export interface MemoPlugins {
  plugins: Plugin[] // 插件列表
  versions: Record<string, string> // 每个插件的版本号，如："memo-plugin-translate-tencent": "1.0.3",
}

export interface ManifestConfiguration {
  label: string; // 选项标签，支持多语言
  key: string; // 表单对象的Key，通常是需要配置的属性，如：“host”
  type: "password" | "text" | "number" | "checkbox" | "select" | "slider"; // 输入控件类型
  placeholder: string; // 输入控件的占位提示，支持多语言
  description: string; // 输入控件的描述，支持多语言
  helpText: string; // 输入控件的帮助信息，支持多语言
  searchPlaceholder?: string;
  emptyPlaceholder?: string;
  range?: { min: number, max: number, step: number }; // 滑动条输入控件的选项列表
  options?: { // 多选输入控件的选项列表
    value: string,
    label: string
  }[],
  useI18nOptions?: boolean;// 多选输入控件的选项列表是否使用多语言的 label
  inherit?: string // 是否继承应用全局的配置，如："openAI.Host"
}

export interface Manifest {
  manifestVersion: string; // 插件的 manifest 版本号
  version: string; // 插件版本, 如：1.0.0
  version_name: string; // 插件版本名称，如：beta，alpha，release
  title: string; // 插件标题
  description: string; // 插件描述
  type: "translate" | "summarize" | "download" | "tts" | "transcription"; // 插件类别
  pluginId: string; // 插件在整个应用的唯一ID，命名为 “应用-plugin-类别-服务商” 如：memo-plugin-translate-ollama
  category: string; // 插件分类
  platforms: string[]; // 插件支持的平台，数组: [ "win32", "darwin" ]
  arch: string[]; // 插件支持的架构，如： "arm64", "x64"
  icon: string; // 插件的图标，线上PNG地址
  link: string; // 插件的下载链接，如：https://plugins.memo.ac/translate/memo-plugin-translate-volctrans@1.0.2.memox
  author: string; // 插件作者
  homepage: string; // 插件主页
  source: string; // 插件源代码地址
  importType?: "module" | "sandbox"; // 插件的导入方式，通过require或者vm
  provider: { // 插件提供的服务
    value: string; // 服务的值，如 EdgeTranslate
    label: string; // 服务的标签，如：微软翻译
    disabled?: boolean; // 是否禁用状态
  };
  configuration: ManifestConfiguration[]; // 插件的配置信息，用于创建动态表单
  defaultsConfiguration: Record<string, any>; // 插件配置的默认值， key/value
  configurationRequired: string[]; // 插件必填的配置，字符串数组
  configurationExposed: string[]; // 插件在每次使用时需要暴露的属性值，字符串数组
  ttsInput?: string[]; // TTS使用的参数
  storageKey?: string; // 配置本地持久存储的key
  configurationStorage?: string[]; // 需要本地持久存储的配置信息
}

export interface I18n { // 插件的多语言，是一个JSON文件
  en: Record<string, string>;
  zh: Record<string, string>;
  zh_tw: Record<string, string>;
  ja: Record<string, string>;
  ko: Record<string, string>;
  es: Record<string, string>;
  de: Record<string, string>;
  it: Record<string, string>;
  [key: string]: Record<string, string>;
}

export type PluginProvider = Manifest["provider"] & { pluginId: string, type: Plugin["type"] }

/**
 * 应用内管理的所有插件
 */
export type PluginReturnType = {
  installedPlugins: Record<string, Plugin>, // { pluginId: Plugin }
  installedPluginsI18ns: Record<string, I18n>, // { pluginId: I18n }
  localPlugins: MemoPlugins, // { pluginId: Plugin }
  onlinePlugins: MemoPlugins // { plugins: Plugin[], versions: Record<string, string> }
  installedPluginsManifests: Record<string, Manifest>// { pluginId: Manifest }
  pluginProviders: Array<PluginProvider> // [{ value: string, label: string, pluginId: string, type: Plugin['type'] }],
  pluginsConfigurations: Record<string, Record<string, any>> // { pluginId@version: { key: value } }
  importedPlugins: Record<string, any> // 已经加载过的插件
}
