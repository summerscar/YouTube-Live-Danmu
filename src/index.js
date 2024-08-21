// ==UserScript==
// @name         YouTube Live Danmu
// @namespace    http://tampermonkey.net/
// @version      0.2
// @description  Youtube Live Danmu
// @author       summerscar
// @match        https://www.youtube.com/*
// @require      https://openuserjs.org/src/libs/sizzle/GM_config.js
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        none
// ==/UserScript==

;(() => {
    // https://github.com/Tampermonkey/tampermonkey/issues/1334#issuecomment-927277844
    window.trustedTypes.createPolicy('default', { createHTML: (string, sink) => string })

    const defaultSpeed = 10
    const defaultMaxLines = 10
    const defaultOpacity = 0.9
    const defaultColor = 'white'
    const defaultFontSize = 20
    const defaultTextShadow = '0 0 5px black'

    GM_config.init({
        id: 'DanmuConfig',
        title: '弹幕设置',
        fields: {
            turnON: {
                label: '开启弹幕',
                type: 'checkbox',
                default: true,
            },
            fontSize: {
                label: '字号',
                type: 'int',
                default: defaultFontSize,
            },
            color: {
                label: '颜色',
                type: 'text',
                default: defaultColor,
            },
            opacity: {
                label: '透明度',
                type: 'float',
                default: defaultOpacity,
            },
            textShadow: {
                label: '弹幕阴影(textShadow css)',
                type: 'text',
                default: defaultTextShadow,
            },
            speed: {
                label: '速度（s）',
                type: 'int',
                default: defaultSpeed,
            },
            maxLines: {
                label: '行数',
                type: 'int',
                default: defaultMaxLines,
            },
        },
        events: {
            init: () => {},
            open: () => {},
            save: () => {
                const config = {
                    danmuStyle: {
                        fontSize: GM_config.get('fontSize'),
                        color: GM_config.get('color'),
                        opacity: GM_config.get('opacity'),
                        textShadow: GM_config.get('textShadow'),
                    },
                    turnON: GM_config.get('turnON'),
                    speed: GM_config.get('speed'),
                    maxLines: GM_config.get('maxLines'),
                }
                setDanmuConfigTurnON(config.turnON)
                setDanmuConfig(config)
                localStorage.setItem('danmuConfig', JSON.stringify(config))
                GM_config.close()
            },
            close: () => {},
            reset: () => {},
        },
    })

    // danmu Controller
    class DanmuController {
        constructor(config = {}) {
            this.turnON = true
            this.danmuStyle = {}
            this.parent = config.parent
            this.danmus = []
            this.danmusEl = []
            this.speed = config.speed || defaultSpeed
            this.maxLines = config.maxLines || defaultMaxLines

            this.danmuStyle.opacity = config.opacity || defaultOpacity
            this.danmuStyle.color = config.color || defaultColor
            this.danmuStyle.fontSize = config.fontSize || defaultFontSize
            this.danmuStyle.textShadow = config.textShadow || defaultTextShadow
        }
        setDanmuTurnON(bol) {
            this.turnON = bol
        }
        setDanmuConfig({ speed, maxLines, danmuStyle } = {}) {
            speed ?? (this.speed = speed)
            maxLines ?? (this.maxLines = maxLines)
            this.danmuStyle = { ...this.danmuStyle, ...danmuStyle }
        }
        createDanmu(danmu) {
            const danmuEl = document.createElement('span')
            danmuEl.style.color = this.danmuStyle.color
            danmuEl.style.opacity = this.danmuStyle.opacity
            danmuEl.style.fontSize = `${this.danmuStyle.fontSize}px`
            danmuEl.style.whiteSpace = 'nowrap'
            danmuEl.style.textShadow = this.danmuStyle.textShadow
            danmuEl.style.animation = `slidein ${this.speed}s linear`
            danmuEl.style.top = `${(this.danmus.length % this.maxLines) * (this.danmuStyle.fontSize + 15)}px`
            danmuEl.style.position = 'absolute'
            danmuEl.style.display = 'inline-block'

            danmuEl.innerHTML = danmu.message
            danmuEl.setAttribute('data-timestamp', danmu.timestamp)
            danmuEl.setAttribute('data-author', danmu.author)
            danmuEl.onanimationend = () => {
                this.removeDanmu(danmuEl)
            }

            this.danmusEl.push(danmuEl)
            this.parent.appendChild(danmuEl)
            // console.color(danmu.timestamp + ' ' + danmu.author + ': ' + danmu.message )
            // this.clearTimeOutDanmu()
        }
        push(danmu) {
            if (this.isPlaying === undefined) {
                this.isPlaying = true
            } else if (!this.isPlaying || !this.turnON) {
                return
            }
            this.danmus.push(danmu)
            this.createDanmu(danmu)
        }
        pause() {
            this.isPlaying = false
            this.danmusEl.forEach((item) => {
                item.style.animationPlayState = 'paused'
            })
        }
        play() {
            this.isPlaying = true
            this.danmusEl.forEach((item) => {
                item.style.animationPlayState = 'running'
            })
        }
        removeDanmu(danmuEl) {
            danmuEl.remove()
            this.danmusEl.splice(this.danmusEl.indexOf(danmuEl), 1)
        }
        clear() {
            this.danmusEl.forEach((danmuEl) => danmuEl.remove())
            this.danmusEl = []
        }
    }
    function formatTime(time) {
        if (!time) return 0
        time = time.replace('PM', '').replace('AM', '').trim()
        const [hh, mm, ss] = time.padStart(8, '00:').split(':')
        let timestamp = 0
        timestamp += Number.parseInt(hh) * 1000 * 60 * 60
        timestamp += Number.parseInt(mm) * 1000 * 60
        timestamp += Number.parseInt(ss) * 1000
        return timestamp
    }

    console.color = console.log.bind(
        console,
        '%cDanMu',
        'background:  #ff7b26; color: white; border-radius: 0.5rem; padding: 0 0.5rem',
    )

    //   聊天列表
    const chatListElement = document.body.querySelector('#items.yt-live-chat-item-list-renderer')
    if (!chatListElement) {
        console.color('can not find chatListElement')
        return
    }

    const playerContainer = window.top.document.body.querySelector('#player-container.ytd-watch-flexy')
    const videoRightControlBar = window.top.document.body.querySelector('.ytp-right-controls')

    let danmuContainer
    let danmuAnimateStyle
    let danmuController
    let videoEl
    let observer
    let videoIsSeeking = false
    init()

    function initAnimateCss() {
        const emojiStyle = `div#danmuContainer img.emoji {
            width: 1em;
            height: 1em;
            vertical-align: middle;
        }`
        if (danmuAnimateStyle) {
            danmuAnimateStyle.innerHTML = `@keyframes slidein {
           from { transform: translateX(${playerContainer.clientWidth}px); }
           to   { transform: translateX(-100%); }
        }${emojiStyle}`

            return
        }
        const head = window.top.document.querySelector('head')
        const style = document.createElement('style')
        style.innerHTML = `@keyframes slidein {
         from { transform: translateX(${playerContainer.clientWidth}px); }
         to   { transform: translateX(-100%); }
       }${emojiStyle}`
        danmuAnimateStyle = style
        head.appendChild(style)
    }
    function init() {
        if (!playerContainer) return
        const div = document.createElement('div')
        div.id = 'danmuContainer'
        div.style.position = 'absolute'
        div.style.left = '0'
        div.style.top = '0'
        div.style.width = '100%'
        div.style.height = '100%'
        div.style.overflow = 'hidden'
        div.style.pointerEvents = 'none'
        playerContainer.appendChild(div)
        danmuContainer = div
        initAnimateCss()
        new ResizeObserver(initAnimateCss).observe(danmuContainer)

        let danmuConfig = localStorage.getItem('danmuConfig')
        let config = {}
        if (danmuConfig) {
            danmuConfig = JSON.parse(danmuConfig)
            const { danmuStyle, ...restConfig } = danmuConfig
            config = { ...danmuStyle, ...restConfig }
            Object.entries(config).forEach(([key, val]) => {
                try {
                    GM_config.set(key, val)
                } catch (e) {
                    console.color(`error: ${String(e)}`)
                }
            })
        }

        danmuController = new DanmuController({ parent: danmuContainer, ...config })
        addVideoEvent()
        insertDanmuConfigBtn()
        window.addEventListener('unload', (event) => {
            observer?.disconnect()
            setDanmuConfigTurnON(false)
            console.color('unload')
        })
        console.color('inited !')
    }
    function insertDanmuConfigBtn() {
        if (videoRightControlBar.querySelector('#DanmuConfigBtn')) return
        console.log('插入 按钮')
        const btn = document.createElement('button')
        btn.id = 'DanmuConfigBtn'
        btn.innerHTML = '弹幕'
        btn.style.verticalAlign = 'top'
        btn.classList.add('ytp-button')
        btn.onclick = () => GM_config.open()
        videoRightControlBar.insertBefore(btn, videoRightControlBar.firstChild)
    }
    function playDanmu() {
        if (videoIsSeeking) return
        danmuController.play()
    }
    function pauseDanmu() {
        danmuController.pause()
    }
    function setIsSeeking() {
        videoIsSeeking = true
        pauseDanmu()
    }
    function setIsSeeked() {
        videoIsSeeking = false
        danmuController.play()
    }
    function addVideoEvent() {
        videoEl = playerContainer.querySelector('video')
        const isSeeking = false
        videoEl.addEventListener('play', playDanmu)
        videoEl.addEventListener('seeked', setIsSeeked)
        videoEl.addEventListener('pause', pauseDanmu)
        videoEl.addEventListener('seeking', setIsSeeking)
    }
    function setDanmuConfigTurnON(bol) {
        danmuController.setDanmuTurnON(bol)
        !bol && danmuController.clear()
    }
    function setDanmuConfig(config) {
        danmuController.setDanmuConfig(config)
    }
    // observer callback
    function observerCallback(mutationList) {
        mutationList.forEach((mutation) => {
            switch (mutation.type) {
                case 'childList':
                    if (!mutation.addedNodes.length) return
                    ;[...mutation.addedNodes].forEach((el) => {
                        if (el.tagName.toLowerCase() === 'yt-live-chat-mode-change-message-renderer') return
                        const message = el.querySelector('#content #message')?.innerHTML
                        const timestamp = formatTime(el.querySelector('#content #timestamp')?.textContent)
                        if (!timestamp) return
                        const author = el.querySelector('#content yt-live-chat-author-chip')?.textContent
                        danmuController.push({ timestamp, message, author })
                    })
                    break
                case 'attributes':
                    break
            }
        })
    }
    // observer
    if (observer) observer.disconnect()
    observer = new MutationObserver(observerCallback)
    observer.observe(chatListElement, { subtree: false, childList: true })
    console.color('start observer')
})()
