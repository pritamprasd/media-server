const jsModules = import.meta.glob('./*.js', { eager: true });
const htmlModules = import.meta.glob('./*.html', { eager: true, query: '?url', import: 'default' });

function toolId(path) {
  return path.replace(/^\.\//, '').replace(/\.\w+$/, '');
}

export function getTools() {
  const tools = [];
  for (const [path, mod] of Object.entries(jsModules)) {
    if (path.endsWith('/index.js')) continue;
    tools.push({
      id: toolId(path),
      type: 'js',
      name: mod.name || toolId(path),
      description: mod.description || '',
      module: mod,
    });
  }
  for (const [path, url] of Object.entries(htmlModules)) {
    tools.push({
      id: toolId(path),
      type: 'html',
      name: toolId(path),
      description: '',
      url,
    });
  }
  return tools;
}

export function getTool(id) {
  for (const [path, mod] of Object.entries(jsModules)) {
    if (path.endsWith('/index.js')) continue;
    if (toolId(path) === id) {
      return { id, type: 'js', name: mod.name || id, description: mod.description || '', module: mod };
    }
  }
  for (const [path, url] of Object.entries(htmlModules)) {
    if (toolId(path) === id) {
      return { id, type: 'html', name: toolId(id), description: '', url };
    }
  }
  return null;
}
