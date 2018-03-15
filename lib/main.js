const path = require('path')
const {AutoLanguageClient} = require('atom-languageclient')

const luaScopes = [ 'source.lua', 'lua' ]
const tlScopes = [ 'source.tl', 'source.tdl', 'source.typed.lua', 'source.t.lua', 'typedlua' ]
const allScopes = tlScopes.concat(luaScopes)
const tlExtensions = [ '.tl', '.tdl', '.t.lua', '.typed.lua' ]
const luaExtensions = [ '.js' ]
const allExtensions = tlExtensions.concat(luaExtensions)

class TypedLuaLanguageClient extends AutoLanguageClient {
  getGrammarScopes () {
    return atom.config.get('ide-typedlua.luaSupport') ? allScopes : tlScopes
  }
  getLanguageName () { return 'TypedLua' }
  getServerName () { return 'TLC' }

  startServerProcess () {
    this.supportedExtensions = atom.config.get('ide-typedlua.luaSupport') ? allExtensions : tlExtensions
    const args = [ 'tlcli.js', '-lsp' ]
    return super.spawnChildNode(args, { cwd: path.join(__dirname, '..', 'typedlua') })
  }

  preInitialization (connection) {
    connection.onCustom('$/partialResult', () => {}) // Suppress partialResult until the language server honors 'streaming' detection
  }

  consumeLinterV2() {
    if (atom.config.get('ide-typedlua.diagnosticsEnabled') === true) {
      super.consumeLinterV2.apply(this, arguments)
    }
  }

  deactivate() {
    return Promise.race([super.deactivate(), this.createTimeoutPromise(2000)])
  }

  createTimeoutPromise(milliseconds) {
    return new Promise((resolve, reject) => {
      let timeout = setTimeout(() => {
        clearTimeout(timeout)
        this.logger.error(`Server failed to shutdown in ${milliseconds}ms, forcing termination`)
        resolve()
      }, milliseconds)
    })
  }

  onDidConvertAutocomplete(completionItem, suggestion, request) {
    if (suggestion.rightLabel == null || suggestion.displayText == null) return

    const nameIndex = suggestion.rightLabel.indexOf(suggestion.displayText)
    if (nameIndex >= 0) {
      const signature = suggestion.rightLabel.substr(nameIndex + suggestion.displayText.length).trim()
      let paramsStart = -1
      let paramsEnd = -1
      let returnStart = -1
      let bracesDepth = 0
      for(let i = 0; i < signature.length; i++) {
        switch(signature[i]) {
          case '(': {
            if (bracesDepth++ === 0 && paramsStart === -1) {
              paramsStart = i;
            }
            break;
          }
          case ')': {
            if (--bracesDepth === 0 && paramsEnd === -1) {
              paramsEnd = i;
            }
            break;
          }
          case ':': {
            if (returnStart === -1 && bracesDepth === 0) {
              returnStart = i;
            }
            break;
          }
        }
      }
      if (atom.config.get('ide-typedlua.returnTypeInAutocomplete') === 'left') {
        if (paramsStart > -1) {
          suggestion.rightLabel = signature.substring(paramsStart, paramsEnd + 1).trim()
        }
        if (returnStart > -1) {
          suggestion.leftLabel = signature.substring(returnStart + 1).trim()
        }
        // We have a 'property' icon, we don't need to pollute the signature with '(property) '
        const propertyPrefix = '(property) '
        if (suggestion.rightLabel.startsWith(propertyPrefix)) {
          suggestion.rightLabel = suggestion.rightLabel.substring(propertyPrefix.length)
        }
      } else {
        suggestion.rightLabel = signature.substring(paramsStart).trim()
        suggestion.leftLabel = ''
      }
    }
  }

  filterChangeWatchedFiles(filePath) {
    return this.supportedExtensions.indexOf(path.extname(filePath).toLowerCase()) > -1;
  }
}

module.exports = new TypedLuaLanguageClient()
