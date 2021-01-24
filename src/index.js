import { writable, get as getStore } from 'svelte/store'

export { default as RouterViewport } from './RouterViewport.svelte'
export { default as RouterLink } from './RouterLink.svelte'

function isValidTokenChar(code) {
	// a-z
	if (code >= 97 && code <= 122) {
		return true
	}
	// A-Z
	if (code >= 65 && code <= 90) {
		return true
	}
	// 0-9
	if (code >= 48 && code <= 57) {
		return true
	}

	switch (code) {
		case 33:  // ! Exclamation mark
		case 36:  // $ Dollar sign
		case 38:  // & Ampersand
		case 39:  // ' Apostrophe
		case 40:  // ( Left parenthesis
		case 41:  // ) Right parenthesis
		case 42:  // * Asterisk
		case 43:  // + Plus sign
		case 44:  // , Comma
		case 45:  // - Hyphen
		case 46:  // . Period
		case 59:  // ; Semicolon
		case 61:  // = Equals sign
		case 64:  // @ At
		case 95:  // _ Underscore
		case 126: // ~ Tilde
			return true
	}

	return false
}

function parsePathTemplate(template) {
	if (typeof template !== 'string') {
		return new Error(`unexpected type (${typeof template})`)
	}

	if (template.length < 1) {
		return new Error(`invalid path (empty)`)
	}

	const templObject = {
		tokens: [],
		parameters: [],
	}

	const regToken = (isParam, begin, end) => {
		const slice = template.substr(begin, end-begin)

		if (isParam) {
			if (slice.length < 1) {
				return new Error(`missing parameter name at ${begin}`)
			}

			if (slice in templObject.parameters) {
				return new Error(`redeclared parameter '${slice}' at ${begin}`)
			}

			if (isParam) {
				templObject.parameters.push(slice)
			}
		}

		templObject.tokens.push({
			token: slice,
			param: isParam,
		})
	}

	if (template.charCodeAt(0) != 47) {
		return new Error('a path template must begin with a slash')
	}
	
	let isPreviousSlash = true
	let isStatic = false
	let isParam = false
	let tokenStart = 1

	for (let itr = 0; itr < template.length; itr++) {
		const charCode = template.charCodeAt(itr)

		if (isPreviousSlash) {
			// Ignore multiple slashes
			if (charCode == 47) {
				continue
			}
			isPreviousSlash = false

			// Start scanning parameter
			if (charCode == 58) {
				isStatic = false
				isParam = true
				tokenStart = itr+1
			}
			// Start scanning static token
			else if (isValidTokenChar(charCode)) {
				isStatic = true
				isParam = false
				tokenStart = itr
			}
			else {
				return new Error(
					`unexpected '${String.fromCharCode(charCode)}' at ${itr}`
				)
			}
		}
		else if (charCode == 47) {
			// Terminating slash encountered
			isPreviousSlash = true

			const err = regToken(isParam, tokenStart, itr)
			if (err != null) {
				return err
			}

			isStatic = false
			isParam = false
		}
		else if (!isValidTokenChar(charCode)) {
			return new Error(
				`unexpected '${String.fromCharCode(charCode)}' at ${itr}`
			)
		}

		if (itr+1 >= template.length) {
			// Last character reached
			if (isPreviousSlash) {
				break
			}

			if (charCode == 58) {
				return new Error(`missing parameter name at ${itr}`)
			}

			const err = regToken(isParam, tokenStart, template.length)
			if (err != null) {
				return err
			}
		}
	}

	return templObject
}

function validateRouteName(routeName) {
	if (routeName.length < 1) {
		return new Error(`invalid route name (empty)`)
	}

	const charCode = routeName.charCodeAt(0)
	if (
		/*A-Z*/ (charCode < 65 && charCode > 90) &&
		/*a-z*/ (charCode < 97 && charCode > 122)
	) {
		return new Error(
			`unexpected character ${String.fromCharCode(charCode)} ` +
			`in route name at 0 (leading character must be [A-Za-z])`
		)
	}

	for (let itr = 1; itr < routeName.length; itr++) {
		const charCode = routeName.charCodeAt(itr)

		// A-Z
		if (charCode >= 65 && charCode <= 90) {
			continue
		}
		// a-z
		if (charCode >= 97 && charCode <= 122) {
			continue
		}
		// 0-9
		if (charCode >= 48 && charCode <= 57) {
			continue
		}

		switch (charCode) {
			case 45: // - Hyphen
			case 46: // . Period
			case 95: // _ Underscore
				continue
		}

		return new Error(
			`unexpected character ${String.fromCharCode(charCode)} ` +
			`in route name at ${itr}`
		)
	}
}

function parseURLPath(path, urlParams) {
	if (typeof path !== 'string') {
		return new Error(`unexpected type (${typeof path})`)
	}

	if (path.length < 1) {
		return new Error(`invalid path (empty)`)
	}

	const pathTokens = []

	// Check if path begin with a slash
	if (path.charCodeAt(0) != 47) {
		return new Error('a path path must begin with a slash')
	}

	let isPreviousSlash = true
	let tokenStart = 1

	for (let itr = 1; itr < path.length; itr++) {
		const charCode = path.charCodeAt(itr)

		if (isPreviousSlash) {
			// Ignore multiple slashes
			if (charCode == 47) {
				continue
			}
			isPreviousSlash = false

			// Start scanning token
			if (isValidTokenChar(charCode)) {
				tokenStart = itr
			}
			else {
				return new Error(
					`unexpected '${String.fromCharCode(charCode)}' at ${itr}`
				)
			}
		}
		// Terminating slash encountered
		else if (charCode == 47) {
			isPreviousSlash = true
			pathTokens.push(
				path.substr(
					tokenStart,
					itr-tokenStart,
				)
			)
		}
		else if (!isValidTokenChar(charCode)) {
			return new Error(
				`unexpected '${String.fromCharCode(charCode)}' at ${itr}`
			)
		}

		if (itr+1 >= path.length) {
			// Last character reached
			if (isPreviousSlash) {
				break
			}
			pathTokens.push(
				path.substr(
					tokenStart,
					path.length-tokenStart
				)
			)
		}
	}

	let urlParamTokens = null

	if (urlParams) {
		urlParamTokens = {}
		let question = urlParams.indexOf('?')
		let hash = urlParams.indexOf('#')
		if(hash == -1 && question == -1) {
			return {}
		}
		if(hash == -1) {
			hash = urlParams.length
		}
		let query = (
			question == -1 ||
			hash == question + 1 ?
				urlParams.substring(hash)
				: urlParams.substring(question + 1, hash)
		)
		let result = {}
		query.split('&').forEach((part)=> {
			if(!part) {
				return
			}
			// replace every + with space, regexp-free version
			part = part.split("+").join(' ')
			
			let eq = part.indexOf('=')
			let key = eq >- 1 ?
				part.substr(0,eq) : part
			let val = eq >- 1 ?
				decodeURIComponent(part.substr(eq+1)) : ''

			let from = key.indexOf('[')
			if (from == -1) {
				urlParamTokens[decodeURIComponent(key)] = val
			}
			else {
				let to = key.indexOf(']',from)
				let index = decodeURIComponent(
					key.substring(from + 1, to)
				)
				key = decodeURIComponent(
					key.substring(0, from)
				)
				if(!urlParamTokens[key]) {
					urlParamTokens[key] = []
				}
				if(!index) {
					urlParamTokens[key].push(val)
				}
				else {
					urlParamTokens[key][index] = val
				}
			}
		})
	}
	return { pathTokens, urlParamTokens }
}

export function Router(conf) {
	if (conf.routes == null || conf.routes.length < 1) {
		throw new Error('missing routes')
	}

	const _window = (function() {
		if (conf.window == null) {
			throw new Error('missing window reference')
		}
		return conf.window
	})();
	const eventRouteUpdated = new CustomEvent('routeUpdated')
	const _templates = {}
	const _routes = {}
	const _index = {
		routeName: null,
		param: null,
		routes: {},
		component: null,
	}

	const _beforePush = conf.beforePush !== undefined ?
		conf.beforePush : null

	const _fallbackRoute = conf.fallback
	// if redirect is not set then it's false
	if (_fallbackRoute && _fallbackRoute.redirect == undefined) {
		_fallbackRoute.redirect = false
	}

	const {
		subscribe: storeSubscribe,
		update: storeUpdate,
	} = writable({
		routes: [],
		route: {
			name: '',
			params: {},
			component: null,
		},
	})

	for (const routeName in conf.routes) {
		const route = conf.routes[routeName]
		const template = route.path

		// Ensure route name validity
		let err = validateRouteName(routeName)
		if (err instanceof Error) {
			throw err
		}

		// Ensure route name uniqueness
		if (routeName in _routes) {
			throw new Error(`redeclaration of route ${routeName}`)
		}

		// Parse path and ensure it's validity
		const path = parsePathTemplate(template)
		if (path instanceof Error) {
			throw new Error(
				`route ${routeName} defines an invalid path template: ${path}`
			)
		}

		const entry = {
			path,
			component: route.component || null,
			metadata: route.metadata || null,
		}

		// Ensure path template uniqueness
		if (!(template in _templates)) {
			_templates[template] = entry
		}
		_routes[routeName] = entry

		let currentNode = _index
		if (path.tokens.length <= 0) {
			currentNode.routeName = routeName
		}
		else for (let level = 0; level < path.tokens.length; level++) {
			const token = path.tokens[level]

			if (token.param) {
				// Follow node
				if (currentNode.param != null) {
					currentNode = currentNode.param
				}
				// Initialize parameterized branch
				else {
					const newNode = {
						routeName,
						name: token.token,
						param: null,
						routes: {},
						metadata: route.metadata,
						component: null,
					}
					currentNode.param = newNode
					currentNode = newNode
				}
			}
			else {
				const routeNode = currentNode.routes[token.token]
				// Declare static route node
				if (!routeNode) {
					const newNode = {
						routeName,
						param: null,
						routes: {},
						metadata: route.metadata,
						component: null,
					}
					currentNode.routes[token.token] = newNode
					currentNode = newNode
				}
				// Follow node
				else {
					currentNode = routeNode
				}
			}
		}
		currentNode.component = entry.component
	}

	storeUpdate(store => {
		for (let route in _routes) {
			store.routes.push({
				name: route,
				..._routes[route],
			})
		}
		return store
	})

	function verifyNameAndParams(name, params) {
		if (name === undefined) {
			throw new Error('missing parameter name')
		}
		const route = _routes[name]
		if (route == null) {
			throw new Error(`route '${name}' not found`)
		}

		const paramNames = route.path.parameters
		if (paramNames.length > 0) {
			if (!params) {
				throw new Error(`missing parameters: ${paramNames}`)
			}

			// Parameters expected
			for (const paramName of route.path.parameters) {
				if (!(paramName in params)) {
					throw new Error(`missing parameter '${paramName}'`)
				}
			}
		}

		return route
	}

	function getRoute(path, urlParams) {
		const parsedURLPath = parseURLPath(path, urlParams)
		if (parsedURLPath instanceof Error) {
			return parsedURLPath
		}
		const tokens = parsedURLPath.pathTokens
		const urlParamTokens = parsedURLPath.urlParamTokens
		let currentNode = _index
		const params = {}

		if (tokens.length === 0) {
			if (currentNode.routeName == null) {
				return new Error(`path ${path} doesn't resolve any route`)
			}
			return {
				name: currentNode.routeName,
				urlParams: urlParamTokens,
				component: currentNode.component,
			}
		}
		else for (let level = 0; level < tokens.length; level++) {
			const token = tokens[level]

			// tokens is a static route
			if (token in currentNode.routes) {
				currentNode = currentNode.routes[token]
			}
			// parameter route
			else if(currentNode.param) {
				currentNode = currentNode.param
				params[currentNode.name] = token
			}
			else {
				return new Error(`path ${path} doesn't resolve any route`)
			}

			// is last token
			if (level + 1 >= tokens.length) {
				// display component
				if (currentNode.component) {
					return {
						name: currentNode.routeName,
						params,
						urlParams: urlParamTokens,
						component: currentNode.component
					}
				}
				else {
					return new Error(`path ${path} doesn't resolve any route`)
				}
			}
		}
	}

	function stringifyRoutePath(tokens, params, urlParams) {
		let str = ''
		if (tokens.length < 1) {
			return '/'
		}
		for (const idx in tokens) {
			const token = tokens[idx]
			if (token.param && !params) {
				throw new Error(
					`expected parameter '${token.token}' but got '${params}'`
				)
			}
			str += token.param ? `/${params[token.token]}` : `/${token.token}`
		}
		if (urlParams) {
			const urlParamsLen = Object.keys(urlParams).length
			let itr = 0
			if (urlParamsLen > 0) {
				str += '?'
				for (const param in urlParams) {
					str += param +'='+ urlParams[param]
					if (itr < urlParamsLen - 1) {
						str += '&'
					}
					itr++
				}
			}
		}
		return str
	}

	function nameToPath(name, params, urlParams) {
		if (name && name === '') {
			throw new Error(`invalid name: '${name}'`)
		}
		return stringifyRoutePath(
			_routes[name].path.tokens,
			params,
			urlParams,
		)
	}

	// setCurrentRoute executes the beforePush hook (if any), updates the
	// current route pushing the path to the browser history if the current
	// browser URL doesn't match and returns the name and parameters of
	// the route that was finally selected
	function setCurrentRoute(path, name, params, urlParams, redirect = true) {
		let route = verifyNameAndParams(name, params)

		if (_beforePush !== null) {
			let prevRoute = getStore({subscribe: storeSubscribe}).route
			if (prevRoute.name === '' && prevRoute.component === null) {
				prevRoute = null
			}
			const beforePushRes = _beforePush(name, params, urlParams, prevRoute)

			if (beforePushRes === false) {
				return false
			}
			else if (beforePushRes === null) {
				throw new Error(
					'beforePush must return either false ' +
					'or {name, ?params, ?urlParams}' +
					`; returned: ${beforePushRes}`,
				)
			}
			else if (beforePushRes !== null) {
				if (!beforePushRes.hasOwnProperty("name")) {
					throw new Error(
						'beforePush must return either false ' +
						'or {name, ?params, ?urlParams}' +
						`; returned: ${JSON.stringify(beforePushRes)}`,
					)
				}
				name = beforePushRes.name
				params = beforePushRes.params
				urlParams = beforePushRes.urlParams
				path = nameToPath(name, params, urlParams)
			}
	
			route = verifyNameAndParams(name, params)
		}

		// Update store
		storeUpdate(store => {
			store.route = {
				name,
				params,
				urlParams,
				component: route.component,
				metadata: route.metadata,
			}
			return store
		})

		// Reconstruct path from route tokens and parameters if non is given
		if (path == null) {
			path = stringifyRoutePath(route.path.tokens, params, urlParams)
		}

		if (
			redirect &&
			_window.location.pathname + _window.location.search != path
		) {
			_window.history.pushState({name, params, urlParams}, null, path)
		}

		return {name, path, params, urlParams}
	}

	function push(name, params, urlParams) {
		return setCurrentRoute(null, name, params, urlParams)
	}

	function navigate(path, urlParams) {
		const route = getRoute(path, urlParams)
		if (route instanceof Error) {
			if (_fallbackRoute != null) {
				return setCurrentRoute(
					null,
					_fallbackRoute.name,
					_fallbackRoute.params,
					route.urlParams,
					_fallbackRoute.redirect,
				)
			}
			else {
				throw route
			}
		}

		return setCurrentRoute(path, route.name, route.params, route.urlParams)
	}

	_window.addEventListener('popstate', () => {
		navigate(_window.location.pathname, _window.location.search)
		_window.dispatchEvent(eventRouteUpdated)
	})

	Object.defineProperties(this, {
		subscribe:  { value: storeSubscribe },
		push:       { value: (name, params) => {
			push(name, params)
			_window.dispatchEvent(eventRouteUpdated)
		}},
		back:       { value: () => _window.history.back() },
		forward:    { value: () => _window.history.forward() },
		nameToPath: { value: nameToPath },
		navigate:   { value: path => {
			navigate(path)
			_window.dispatchEvent(eventRouteUpdated)
		}},
	})

	// Initialize current route
	navigate(_window.location.pathname, _window.location.search)
}
