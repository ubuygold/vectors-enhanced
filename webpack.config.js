const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  entry: './src/index.js',  // 新的模块化入口
  output: {
    filename: 'index.js',  // 保持与 manifest.json 一致
    path: path.resolve(__dirname, '.'),
    clean: false,  // 不清理根目录
    // 为了兼容 SillyTavern 扩展系统，使用 IIFE 格式
    library: {
      type: 'var',
      name: 'VectorsEnhanced'
    }
  },
  module: {
    rules: [
      {
        test: /\.css$/i,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  plugins: [
    // 如果将来样式也模块化，可以使用这个插件复制
    // new CopyPlugin({
    //   patterns: [
    //     { from: "src/style.css", to: "style.css" },
    //   ],
    // }),
  ],
  optimization: {
    minimize: false  // 开发阶段不压缩，便于调试
  },
  devtool: 'source-map',  // 生成源映射便于调试
  // 处理 jQuery 和 SillyTavern API 的外部依赖
  externals: {
    'jquery': 'jQuery',
    '$': 'jQuery'
  }
};
