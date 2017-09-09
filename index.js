const fs = require('fs')
const camelCase = require('lodash/camelCase')
const babel = require('babel-core')
const path = require('path')
const glob = require('glob')

function filename(uri) {
    const basename = path.basename(uri)
    const extname = path.extname(uri)
    const index = basename.indexOf(extname)
    return basename.slice(0, index)
}

function matchfile(context, uri) {
    const absolutePath = path.resolve(context, uri)
    const matched = glob.sync(absolutePath)
    if(matched.length === 0) return null
    return absolutePath
}

function toReactStaticComponent(context, resource, addDeps) {
    return function({ types: t }) {

	const getExport = function (node) {
	    return t.exportDefaultDeclaration(
		t.FunctionDeclaration(
		    t.identifier('ReactStaticComponent'),
		    [
			t.identifier('props')
		    ],
		    t.blockStatement(
			[t.returnStatement(node)]
		    )
		)
	    )
	}

	const findComponent = function(name) {
	    // Find current directory
	    const currentDirectory = matchfile(context, name.toLowerCase() + '.html')
	    if(currentDirectory) return currentDirectory

	    // Find 'src/components' directory
	    const componentDirectory = matchfile('src/components', name.toLowerCase() + '.html')
	    if(componentDirectory) return componentDirectory
	}

	const attrVisitor = {
	    
	    JSXAttribute(path) {
		/**
		 * Reverse HTML attributes to jsx.
		 *
		 * @link https://facebook.github.io/react/docs/dom-elements.html#differences-in-attributes
		 */
		if(t.isJSXIdentifier(path.node.name)) {
		    
		    /**
		     * Convert 'class' to 'className'.
		     * Convert `@foo` to style.foo
		     */
		    if(path.node.name.name === 'class') {
			path.node.name.name = 'className'
			const val = path.node.value.value
			if(typeof val === 'string') {
			    if(~val.indexOf('$') || ~val.indexOf('@')) {
				/**
				 * $foo => style.foo
				 * @bar => props.bar 
				 */
				const collects = []
				val.split(' ').forEach(elem => {
				    if(~elem.indexOf('$')) {
					collects.push(
					    t.memberExpression(
						t.identifier('style'),
						t.identifier(elem.replace(/\$/, ''))
					    )
					)
				    } else if(~elem.indexOf('@')) {
					collects.push(
					    t.memberExpression(
						t.identifier('props'),
						t.identifier(elem.replace(/\@/, ''))
					    )
					)
				    } else {
					/**
					 * Can't find symbols.
					 */
					collects.push(t.stringLiteral(elem))
				    }
				})
				
				path.node.value = t.jSXExpressionContainer(
				    t.callExpression(
					t.memberExpression(
					    t.arrayExpression(collects),
					    t.identifier('join')
					),
					[
					    t.stringLiteral(' ')
					]
				    )
				)
			    }
			}
		    }
		    
		    /**
		     * Convert 'for' to 'htmlFor'.
		     */
		    if(path.node.name.name === 'for') {
			path.node.name.name = 'htmlFor'
		    }

		    /**
		     * Convert inline style to jsx style object.
		     */
		    if (path.node.name.name === 'style') {
			const val = path.node.value.value
			const collects = {}
			val.split(';').filter(Boolean).forEach(elem => {
			    const index = elem.indexOf(':')
			    const key = elem.slice(0, index).trim()
			    const value = elem.slice(index + 1).trim()
			    collects[key] = value
			})
			const props = Object.keys(collects).map(prop => t.objectProperty(
			    t.identifier(camelCase(prop)),
			    t.stringLiteral(collects[prop])
			))
			path.node.value = t.jSXExpressionContainer(
			    t.objectExpression(props)
			)
		    }

		    /**
		     * Convert foo-bar to cameCase style.
		     */
		    if (~path.node.name.name.indexOf('-')) {
			if(!~path.node.name.name.indexOf('data') || !~path.node.name.name.indexOf('aria')) {
			    path.node.name.name = camelCase(path.node.name.name)
			}
		    }
		}
	    }
	}
	

	const wrapExpressionVisitor = {
	    ExpressionStatement(path) {
		if (!path.get('expression').isJSXElement()) return
		path.replaceWith(getExport(path.get('expression').node))
	    }
	}
	
	const programVisitor = {
	    Program(path) {
		// CSSModules inject
		const stylefile = matchfile(context, filename(resource) + '.css')
		if(stylefile) {
		    path.node.body.unshift(
		        t.importDeclaration(
			    [
			        t.importDefaultSpecifier(t.identifier('style'))
			    ],
			    t.stringLiteral(stylefile)
		        )
		    )
		}          
		
		// Load component
		path.traverse({
		    JSXOpeningElement(jpath) {
			const name = jpath.node.name.name
			if(!/^[A-Z]/.test(name)) return

			const component = findComponent(name)
			if(!component) throw new Error(`NotFoundError ${component}`) 
			path.node.body.unshift(
			    t.importDeclaration(
				[
				    t.importDefaultSpecifier(t.identifier(name))
				],
				t.stringLiteral(component)
			    )
			)
			addDeps(component)
		    }
		})

		// Append react lib
		path.node.body.unshift(
		    t.importDeclaration(
			[
			    t.importDefaultSpecifier(t.identifier('React'))
			],
			t.stringLiteral('react')
		    )
		)
	    }
	}
	
	return {
	    visitor: Object.assign({}, programVisitor, wrapExpressionVisitor, attrVisitor)
	}
    }
}


module.exports = function (content) {
    this.cacheable && this.cacheable(true)
    this.addDependency(this.resourcePath)

    const cb = this.async()

    try {
	const result = babel.transform(content, {
	    babelrc: false,
	    presets: ['react'],
	    plugins: [toReactStaticComponent(this.context, this.resourcePath, this.addDependency)]
	})
	//console.log(result.code)
	cb(null, result.code)
    } catch(e) {
	cb(e)
    }
}
