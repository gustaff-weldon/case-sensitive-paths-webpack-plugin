var webpack = require('webpack');
var path = require('path');
var HtmlWebpackPlugin = require('html-webpack-plugin');
var CaseSensitivePathsPlugin = require('../index.js'); // use inside the npm package

// Setup our plugins.
var plugins = [
  // attaches the webpack-generated JS to our main HTML file
  new HtmlWebpackPlugin({template: './src/index.html'}),
  // create global access to the NODE_ENV within our Webpacked code:
  new webpack.DefinePlugin({
    __ENV__: JSON.stringify(process.env.NODE_ENV)
  }),
  // Mac doesn't care about case, but linux servers do, so enforce...
  new CaseSensitivePathsPlugin()
];

module.exports = {
  mode: 'development',

  // Bundle to our dist folder as a main.js file.
  output: {
    path: path.join(__dirname, 'dist'),
    filename: 'main.js',
    publicPath: '/'
  },

  devtool: 'source-map',

  // Our master entry point.
  entry: [
      'webpack-dev-server/client?http://0.0.0.0:3000', // tells client where to get hot reloads
      'webpack/hot/only-dev-server', // "only" prevents reload on syntax errors
      'babel-polyfill', // for full ES6 compatibility on older devices
      './src/init.js'
    ],

  module: {
    rules: [{
      test: /\.(js|jsx)$/,
      use: {
        loader: 'babel-loader',
        options: {
          presets: ['@babel/preset-env', '@babel/preset-react']
        }
      },
      exclude: /node_modules/
    }, {
      test: /\.json$/,
      use: 'json'
    }]
  },

  plugins: plugins
};
