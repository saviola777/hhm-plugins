# hhm-plugins
Plugins for the [Haxball Headless Manager (HHM)](https://github.com/saviola777/haxball-headless-manager). For plugin documentation check the
`README` files in the `src/` subdirectories.

See `template.js` for a plugin template (not mandatory).
You can add your plugins to this repository by cloning it, adding your plugin
under `src/author/pluginName` and creating a
[pull request](https://help.github.com/articles/creating-a-pull-request/).

To use plugins from this repository in your HHM config, include the following
in your `HHM.config.repositories`:

```javascript
HHM.config.repositories = [
  {
    type: `github`,
    repository: `saviola777/hhm-plugins`
  },
];
```

For more information on how to write plugins, check out the
[HHM API documentation](https://haxplugins.tk/docs).