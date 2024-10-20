/**
 * Created by vadimdez on 21/06/16.
 */
import { Component, Input, Output, EventEmitter, ViewChild } from '@angular/core';
import { from, fromEvent, Subject } from 'rxjs';
import { debounceTime, filter, takeUntil } from 'rxjs/operators';
import * as PDFJS from 'pdfjs-dist';
import * as PDFJSViewer from 'pdfjs-dist/web/pdf_viewer.mjs';
import { createEventBus } from '../utils/event-bus-utils';
import { assign, isSSR } from '../utils/helpers';
import { GlobalWorkerOptions, VerbosityLevel, getDocument } from 'pdfjs-dist';
import * as i0 from "@angular/core";
if (!isSSR()) {
    assign(PDFJS, 'verbosity', VerbosityLevel.INFOS);
}
// @ts-expect-error This does not exist outside of polyfill which this is doing
if (typeof Promise.withResolvers === 'undefined' && window) {
    // @ts-expect-error This does not exist outside of polyfill which this is doing
    window.Promise.withResolvers = () => {
        let resolve;
        let reject;
        const promise = new Promise((res, rej) => {
            resolve = res;
            reject = rej;
        });
        return { promise, resolve, reject };
    };
}
export var RenderTextMode;
(function (RenderTextMode) {
    RenderTextMode[RenderTextMode["DISABLED"] = 0] = "DISABLED";
    RenderTextMode[RenderTextMode["ENABLED"] = 1] = "ENABLED";
    RenderTextMode[RenderTextMode["ENHANCED"] = 2] = "ENHANCED";
})(RenderTextMode || (RenderTextMode = {}));
export class PdfViewerComponent {
    element;
    ngZone;
    static CSS_UNITS = 96.0 / 72.0;
    static BORDER_WIDTH = 9;
    pdfViewerContainer;
    eventBus;
    pdfLinkService;
    pdfFindController;
    pdfViewer;
    isVisible = false;
    _cMapsUrl = typeof PDFJS !== 'undefined'
        ? `https://unpkg.com/pdfjs-dist@${PDFJS.version}/cmaps/`
        : null;
    _imageResourcesPath = typeof PDFJS !== 'undefined'
        ? `https://unpkg.com/pdfjs-dist@${PDFJS.version}/web/images/`
        : undefined;
    _renderText = true;
    _renderTextMode = RenderTextMode.ENABLED;
    _stickToPage = false;
    _originalSize = true;
    _pdf;
    _page = 1;
    _zoom = 1;
    _zoomScale = 'page-width';
    _rotation = 0;
    _showAll = true;
    _canAutoResize = true;
    _fitToPage = false;
    _externalLinkTarget = 'blank';
    _showBorders = false;
    lastLoaded;
    _latestScrolledPage;
    pageScrollTimeout = null;
    isInitialized = false;
    loadingTask;
    destroy$ = new Subject();
    afterLoadComplete = new EventEmitter();
    pageRendered = new EventEmitter();
    pageInitialized = new EventEmitter();
    textLayerRendered = new EventEmitter();
    onError = new EventEmitter();
    onProgress = new EventEmitter();
    pageChange = new EventEmitter(true);
    src;
    set cMapsUrl(cMapsUrl) {
        this._cMapsUrl = cMapsUrl;
    }
    set page(_page) {
        _page = parseInt(_page, 10) || 1;
        const originalPage = _page;
        if (this._pdf) {
            _page = this.getValidPageNumber(_page);
        }
        this._page = _page;
        if (originalPage !== _page) {
            this.pageChange.emit(_page);
        }
    }
    set renderText(renderText) {
        this._renderText = renderText;
    }
    set renderTextMode(renderTextMode) {
        this._renderTextMode = renderTextMode;
    }
    set originalSize(originalSize) {
        this._originalSize = originalSize;
    }
    set showAll(value) {
        this._showAll = value;
    }
    set stickToPage(value) {
        this._stickToPage = value;
    }
    set zoom(value) {
        if (value <= 0) {
            return;
        }
        this._zoom = value;
    }
    get zoom() {
        return this._zoom;
    }
    set zoomScale(value) {
        this._zoomScale = value;
    }
    get zoomScale() {
        return this._zoomScale;
    }
    set rotation(value) {
        if (!(typeof value === 'number' && value % 90 === 0)) {
            console.warn('Invalid pages rotation angle.');
            return;
        }
        this._rotation = value;
    }
    set externalLinkTarget(value) {
        this._externalLinkTarget = value;
    }
    set autoresize(value) {
        this._canAutoResize = Boolean(value);
    }
    set fitToPage(value) {
        this._fitToPage = Boolean(value);
    }
    set showBorders(value) {
        this._showBorders = Boolean(value);
    }
    static getLinkTarget(type) {
        switch (type) {
            case 'blank':
                return PDFJSViewer.LinkTarget.BLANK;
            case 'none':
                return PDFJSViewer.LinkTarget.NONE;
            case 'self':
                return PDFJSViewer.LinkTarget.SELF;
            case 'parent':
                return PDFJSViewer.LinkTarget.PARENT;
            case 'top':
                return PDFJSViewer.LinkTarget.TOP;
        }
        return null;
    }
    constructor(element, ngZone) {
        this.element = element;
        this.ngZone = ngZone;
        if (isSSR()) {
            return;
        }
        let pdfWorkerSrc;
        const pdfJsVersion = PDFJS.version;
        const versionSpecificPdfWorkerUrl = window[`pdfWorkerSrc${pdfJsVersion}`];
        if (versionSpecificPdfWorkerUrl) {
            pdfWorkerSrc = versionSpecificPdfWorkerUrl;
        }
        else if (window.hasOwnProperty('pdfWorkerSrc') &&
            typeof window.pdfWorkerSrc === 'string' &&
            window.pdfWorkerSrc) {
            pdfWorkerSrc = window.pdfWorkerSrc;
        }
        else {
            pdfWorkerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfJsVersion}/legacy/build/pdf.worker.min.mjs`;
        }
        assign(GlobalWorkerOptions, 'workerSrc', pdfWorkerSrc);
    }
    ngAfterViewChecked() {
        if (this.isInitialized) {
            return;
        }
        const offset = this.pdfViewerContainer.nativeElement.offsetParent;
        if (this.isVisible === true && offset == null) {
            this.isVisible = false;
            return;
        }
        if (this.isVisible === false && offset != null) {
            this.isVisible = true;
            setTimeout(() => {
                this.initialize();
                this.ngOnChanges({ src: this.src });
            });
        }
    }
    ngOnInit() {
        this.initialize();
        this.setupResizeListener();
    }
    ngOnDestroy() {
        this.clear();
        this.destroy$.next();
        this.loadingTask = null;
    }
    ngOnChanges(changes) {
        if (isSSR() || !this.isVisible) {
            return;
        }
        if ('src' in changes) {
            this.loadPDF();
        }
        else if (this._pdf) {
            if ('renderText' in changes || 'showAll' in changes) {
                this.setupViewer();
                this.resetPdfDocument();
            }
            if ('page' in changes) {
                const { page } = changes;
                if (page.currentValue === this._latestScrolledPage) {
                    return;
                }
                // New form of page changing: The viewer will now jump to the specified page when it is changed.
                // This behavior is introduced by using the PDFSinglePageViewer
                this.pdfViewer.scrollPageIntoView({ pageNumber: this._page });
            }
            this.update();
        }
    }
    updateSize() {
        from(this._pdf.getPage(this.pdfViewer.currentPageNumber))
            .pipe(takeUntil(this.destroy$))
            .subscribe({
            next: (page) => {
                const rotation = this._rotation + page.rotate;
                const viewportWidth = page.getViewport({
                    scale: this._zoom,
                    rotation
                }).width * PdfViewerComponent.CSS_UNITS;
                let scale = this._zoom;
                let stickToPage = true;
                // Scale the document when it shouldn't be in original size or doesn't fit into the viewport
                if (!this._originalSize ||
                    (this._fitToPage &&
                        viewportWidth > this.pdfViewerContainer.nativeElement.clientWidth)) {
                    const viewPort = page.getViewport({ scale: 1, rotation });
                    scale = this.getScale(viewPort.width, viewPort.height);
                    stickToPage = !this._stickToPage;
                }
                // delay to ensure that pages are ready
                this.pdfViewer.pagesPromise?.then(() => {
                    this.pdfViewer.currentScale = scale;
                    if (stickToPage)
                        this.pdfViewer.scrollPageIntoView({ pageNumber: page.pageNumber, ignoreDestinationZoom: true });
                });
            }
        });
    }
    clear() {
        if (this.loadingTask && !this.loadingTask.destroyed) {
            this.loadingTask.destroy();
        }
        if (this._pdf) {
            this._latestScrolledPage = 0;
            this._pdf.destroy();
            this._pdf = undefined;
        }
        this.pdfViewer && this.pdfViewer.setDocument(null);
        this.pdfLinkService && this.pdfLinkService.setDocument(null, null);
        this.pdfFindController && this.pdfFindController.setDocument(null);
    }
    getPDFLinkServiceConfig() {
        const linkTarget = PdfViewerComponent.getLinkTarget(this._externalLinkTarget);
        if (linkTarget) {
            return { externalLinkTarget: linkTarget };
        }
        return {};
    }
    initEventBus() {
        this.eventBus = createEventBus(PDFJSViewer, this.destroy$);
        fromEvent(this.eventBus, 'pagerendered')
            .pipe(takeUntil(this.destroy$))
            .subscribe((event) => {
            this.pageRendered.emit(event);
        });
        fromEvent(this.eventBus, 'pagesinit')
            .pipe(takeUntil(this.destroy$))
            .subscribe((event) => {
            this.pageInitialized.emit(event);
        });
        fromEvent(this.eventBus, 'pagechanging')
            .pipe(takeUntil(this.destroy$))
            .subscribe(({ pageNumber }) => {
            if (this.pageScrollTimeout) {
                clearTimeout(this.pageScrollTimeout);
            }
            this.pageScrollTimeout = window.setTimeout(() => {
                this._latestScrolledPage = pageNumber;
                this.pageChange.emit(pageNumber);
            }, 100);
        });
        fromEvent(this.eventBus, 'textlayerrendered')
            .pipe(takeUntil(this.destroy$))
            .subscribe((event) => {
            this.textLayerRendered.emit(event);
        });
    }
    initPDFServices() {
        this.pdfLinkService = new PDFJSViewer.PDFLinkService({
            eventBus: this.eventBus,
            ...this.getPDFLinkServiceConfig()
        });
        this.pdfFindController = new PDFJSViewer.PDFFindController({
            eventBus: this.eventBus,
            linkService: this.pdfLinkService,
        });
    }
    getPDFOptions() {
        return {
            eventBus: this.eventBus,
            container: this.element.nativeElement.querySelector('div'),
            removePageBorders: !this._showBorders,
            linkService: this.pdfLinkService,
            textLayerMode: this._renderText
                ? this._renderTextMode
                : RenderTextMode.DISABLED,
            findController: this.pdfFindController,
            l10n: new PDFJSViewer.GenericL10n('en'),
            imageResourcesPath: this._imageResourcesPath,
            annotationEditorMode: PDFJS.AnnotationEditorType.DISABLE,
        };
    }
    setupViewer() {
        if (this.pdfViewer) {
            this.pdfViewer.setDocument(null);
        }
        assign(PDFJS, 'disableTextLayer', !this._renderText);
        this.initPDFServices();
        if (this._showAll) {
            this.pdfViewer = new PDFJSViewer.PDFViewer(this.getPDFOptions());
        }
        else {
            this.pdfViewer = new PDFJSViewer.PDFSinglePageViewer(this.getPDFOptions());
        }
        this.pdfLinkService.setViewer(this.pdfViewer);
        this.pdfViewer._currentPageNumber = this._page;
    }
    getValidPageNumber(page) {
        if (page < 1) {
            return 1;
        }
        if (page > this._pdf.numPages) {
            return this._pdf.numPages;
        }
        return page;
    }
    getDocumentParams() {
        const srcType = typeof this.src;
        if (!this._cMapsUrl) {
            return this.src;
        }
        const params = {
            cMapUrl: this._cMapsUrl,
            cMapPacked: true,
            enableXfa: true,
        };
        params.isEvalSupported = false; // http://cve.org/CVERecord?id=CVE-2024-4367
        if (srcType === 'string') {
            params.url = this.src;
        }
        else if (srcType === 'object') {
            if (this.src.byteLength !== undefined) {
                params.data = this.src;
            }
            else {
                Object.assign(params, this.src);
            }
        }
        return params;
    }
    loadPDF() {
        if (!this.src) {
            return;
        }
        if (this.lastLoaded === this.src) {
            this.update();
            return;
        }
        this.clear();
        this.setupViewer();
        this.loadingTask = getDocument(this.getDocumentParams());
        this.loadingTask.onProgress = (progressData) => {
            this.onProgress.emit(progressData);
        };
        const src = this.src;
        from(this.loadingTask.promise)
            .pipe(takeUntil(this.destroy$))
            .subscribe({
            next: (pdf) => {
                this._pdf = pdf;
                this.lastLoaded = src;
                this.afterLoadComplete.emit(pdf);
                this.resetPdfDocument();
                this.update();
            },
            error: (error) => {
                this.lastLoaded = null;
                this.onError.emit(error);
            }
        });
    }
    update() {
        this.page = this._page;
        this.render();
    }
    render() {
        this._page = this.getValidPageNumber(this._page);
        if (this._rotation !== 0 ||
            this.pdfViewer.pagesRotation !== this._rotation) {
            // wait until at least the first page is available.
            this.pdfViewer.firstPagePromise?.then(() => (this.pdfViewer.pagesRotation = this._rotation));
        }
        if (this._stickToPage) {
            setTimeout(() => {
                this.pdfViewer.currentPageNumber = this._page;
            });
        }
        this.updateSize();
    }
    getScale(viewportWidth, viewportHeight) {
        const borderSize = this._showBorders ? 2 * PdfViewerComponent.BORDER_WIDTH : 0;
        const pdfContainerWidth = this.pdfViewerContainer.nativeElement.clientWidth - borderSize;
        const pdfContainerHeight = this.pdfViewerContainer.nativeElement.clientHeight - borderSize;
        if (pdfContainerHeight === 0 ||
            viewportHeight === 0 ||
            pdfContainerWidth === 0 ||
            viewportWidth === 0) {
            return 1;
        }
        let ratio = 1;
        switch (this._zoomScale) {
            case 'page-fit':
                ratio = Math.min(pdfContainerHeight / viewportHeight, pdfContainerWidth / viewportWidth);
                break;
            case 'page-height':
                ratio = pdfContainerHeight / viewportHeight;
                break;
            case 'page-width':
            default:
                ratio = pdfContainerWidth / viewportWidth;
                break;
        }
        return (this._zoom * ratio) / PdfViewerComponent.CSS_UNITS;
    }
    resetPdfDocument() {
        this.pdfLinkService.setDocument(this._pdf, null);
        this.pdfFindController.setDocument(this._pdf);
        this.pdfViewer.setDocument(this._pdf);
    }
    initialize() {
        if (isSSR() || !this.isVisible) {
            return;
        }
        this.isInitialized = true;
        this.initEventBus();
        this.setupViewer();
    }
    setupResizeListener() {
        if (isSSR()) {
            return;
        }
        this.ngZone.runOutsideAngular(() => {
            fromEvent(window, 'resize')
                .pipe(debounceTime(100), filter(() => this._canAutoResize && !!this._pdf), takeUntil(this.destroy$))
                .subscribe(() => {
                this.updateSize();
            });
        });
    }
    static ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "16.1.0", ngImport: i0, type: PdfViewerComponent, deps: [{ token: i0.ElementRef }, { token: i0.NgZone }], target: i0.ɵɵFactoryTarget.Component });
    static ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "14.0.0", version: "16.1.0", type: PdfViewerComponent, selector: "pdf-viewer", inputs: { src: "src", cMapsUrl: ["c-maps-url", "cMapsUrl"], page: "page", renderText: ["render-text", "renderText"], renderTextMode: ["render-text-mode", "renderTextMode"], originalSize: ["original-size", "originalSize"], showAll: ["show-all", "showAll"], stickToPage: ["stick-to-page", "stickToPage"], zoom: "zoom", zoomScale: ["zoom-scale", "zoomScale"], rotation: "rotation", externalLinkTarget: ["external-link-target", "externalLinkTarget"], autoresize: "autoresize", fitToPage: ["fit-to-page", "fitToPage"], showBorders: ["show-borders", "showBorders"] }, outputs: { afterLoadComplete: "after-load-complete", pageRendered: "page-rendered", pageInitialized: "pages-initialized", textLayerRendered: "text-layer-rendered", onError: "error", onProgress: "on-progress", pageChange: "pageChange" }, viewQueries: [{ propertyName: "pdfViewerContainer", first: true, predicate: ["pdfViewerContainer"], descendants: true }], usesOnChanges: true, ngImport: i0, template: `
    <div #pdfViewerContainer class="ng2-pdf-viewer-container">
      <div class="pdfViewer"></div>
    </div>
  `, isInline: true, styles: [".ng2-pdf-viewer-container{overflow-x:auto;position:absolute;height:100%;width:100%;-webkit-overflow-scrolling:touch}:host{display:block;position:relative}:host ::ng-deep{--pdfViewer-padding-bottom: 0;--page-margin: 1px auto -8px;--page-border: 9px solid transparent;--spreadHorizontalWrapped-margin-LR: -3.5px;--viewer-container-height: 0;--annotation-unfocused-field-background: url(\"data:image/svg+xml;charset=UTF-8,<svg width='1px' height='1px' xmlns='http://www.w3.org/2000/svg'><rect width='100%' height='100%' style='fill:rgba(0, 54, 255, 0.13);'/></svg>\");--xfa-unfocused-field-background: var( --annotation-unfocused-field-background );--page-border-image: url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABMAAAATCAYAAAByUDbMAAAA1ElEQVQ4jbWUWw6EIAxFy2NFs/8NzR4UJhpqLsdi5mOmSSMUOfYWqv3S0gMr4XlYH/64gZa/gN3ANYA7KAXALt4ktoQ5MI9YxqaG8bWmsIysMuT6piSQCa4whZThCu8CM4zP9YJaKci9jicPq3NcBWYoPMGUlhG7ivtkB+gVyFY75wXghOvh8t5mto1Mdim6e+MBqH6XsY+YAwjpq3vGF7weTWQptLEDVCZvPTMl5JZZsdh47FHW6qFMyvLYqjcnmdFfY9Xk/KDOlzCusX2mi/ofM7MPkzBcSp4Q1/wAAAAASUVORK5CYII=) 9 9 repeat;--scale-factor: 1;--focus-outline: solid 2px blue;--hover-outline: dashed 2px blue;--freetext-line-height: 1.35;--freetext-padding: 2px;--editorInk-editing-cursor: pointer}@media screen and (forced-colors: active){:host ::ng-deep{--pdfViewer-padding-bottom: 9px;--page-margin: 8px auto -1px;--page-border: 1px solid CanvasText;--page-border-image: none;--spreadHorizontalWrapped-margin-LR: 3.5px}}@media (forced-colors: active){:host ::ng-deep{--focus-outline: solid 3px ButtonText;--hover-outline: dashed 3px ButtonText}}:host ::ng-deep .textLayer{position:absolute;text-align:initial;inset:0;overflow:hidden;opacity:.2;line-height:1;-webkit-text-size-adjust:none;text-size-adjust:none;forced-color-adjust:none;transform-origin:0 0}:host ::ng-deep .textLayer span,:host ::ng-deep .textLayer br{color:transparent;position:absolute;white-space:pre;cursor:text;transform-origin:0% 0%}:host ::ng-deep .textLayer span.markedContent{top:0;height:0}:host ::ng-deep .textLayer .highlight{margin:-1px;padding:1px;background-color:#b400aa;border-radius:4px}:host ::ng-deep .textLayer .highlight.appended{position:initial}:host ::ng-deep .textLayer .highlight.begin{border-radius:4px 0 0 4px}:host ::ng-deep .textLayer .highlight.end{border-radius:0 4px 4px 0}:host ::ng-deep .textLayer .highlight.middle{border-radius:0}:host ::ng-deep .textLayer .highlight.selected{background-color:#006400}:host ::ng-deep .textLayer ::selection{background:rgb(0,0,255)}:host ::ng-deep .textLayer br::selection{background:transparent}:host ::ng-deep .textLayer .endOfContent{display:block;position:absolute;inset:100% 0 0;z-index:-1;cursor:default;-webkit-user-select:none;user-select:none}:host ::ng-deep .textLayer .endOfContent.active{top:0}@media (forced-colors: active){:host ::ng-deep .annotationLayer .textWidgetAnnotation input:required,:host ::ng-deep .annotationLayer .textWidgetAnnotation textarea:required,:host ::ng-deep .annotationLayer .choiceWidgetAnnotation select:required,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input:required,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.radioButton input:required{outline:1.5px solid selectedItem}}:host ::ng-deep .annotationLayer{position:absolute;top:0;left:0;pointer-events:none;transform-origin:0 0}:host ::ng-deep .annotationLayer section{position:absolute;text-align:initial;pointer-events:auto;box-sizing:border-box;transform-origin:0 0}:host ::ng-deep .annotationLayer .linkAnnotation>a,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.pushButton>a{position:absolute;font-size:1em;top:0;left:0;width:100%;height:100%}:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.pushButton>canvas{width:100%;height:100%}:host ::ng-deep .annotationLayer .linkAnnotation>a:hover,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.pushButton>a:hover{opacity:.2;background:rgb(255,255,0);box-shadow:0 2px 10px #ff0}:host ::ng-deep .annotationLayer .textAnnotation img{position:absolute;cursor:pointer;width:100%;height:100%}:host ::ng-deep .annotationLayer .textWidgetAnnotation input,:host ::ng-deep .annotationLayer .textWidgetAnnotation textarea,:host ::ng-deep .annotationLayer .choiceWidgetAnnotation select,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.radioButton input{background-image:var(--annotation-unfocused-field-background);border:1px solid transparent;box-sizing:border-box;font:calc(9px * var(--scale-factor)) sans-serif;height:100%;margin:0;vertical-align:top;width:100%}:host ::ng-deep .annotationLayer .textWidgetAnnotation input:required,:host ::ng-deep .annotationLayer .textWidgetAnnotation textarea:required,:host ::ng-deep .annotationLayer .choiceWidgetAnnotation select:required,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input:required,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.radioButton input:required{outline:1.5px solid red}:host ::ng-deep .annotationLayer .choiceWidgetAnnotation select option{padding:0}:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.radioButton input{border-radius:50%}:host ::ng-deep .annotationLayer .textWidgetAnnotation textarea{resize:none}:host ::ng-deep .annotationLayer .textWidgetAnnotation input[disabled],:host ::ng-deep .annotationLayer .textWidgetAnnotation textarea[disabled],:host ::ng-deep .annotationLayer .choiceWidgetAnnotation select[disabled],:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input[disabled],:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.radioButton input[disabled]{background:none;border:1px solid transparent;cursor:not-allowed}:host ::ng-deep .annotationLayer .textWidgetAnnotation input:hover,:host ::ng-deep .annotationLayer .textWidgetAnnotation textarea:hover,:host ::ng-deep .annotationLayer .choiceWidgetAnnotation select:hover,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input:hover,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.radioButton input:hover{border:1px solid rgb(0,0,0)}:host ::ng-deep .annotationLayer .textWidgetAnnotation input:focus,:host ::ng-deep .annotationLayer .textWidgetAnnotation textarea:focus,:host ::ng-deep .annotationLayer .choiceWidgetAnnotation select:focus{background:none;border:1px solid transparent}:host ::ng-deep .annotationLayer .textWidgetAnnotation input :focus,:host ::ng-deep .annotationLayer .textWidgetAnnotation textarea :focus,:host ::ng-deep .annotationLayer .choiceWidgetAnnotation select :focus,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox :focus,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.radioButton :focus{background-image:none;background-color:transparent;outline:auto}:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input:checked:before,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input:checked:after,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.radioButton input:checked:before{background-color:CanvasText;content:\"\";display:block;position:absolute}:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input:checked:before,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input:checked:after{height:80%;left:45%;width:1px}:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input:checked:before{transform:rotate(45deg)}:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input:checked:after{transform:rotate(-45deg)}:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.radioButton input:checked:before{border-radius:50%;height:50%;left:30%;top:20%;width:50%}:host ::ng-deep .annotationLayer .textWidgetAnnotation input.comb{font-family:monospace;padding-left:2px;padding-right:0}:host ::ng-deep .annotationLayer .textWidgetAnnotation input.comb:focus{width:103%}:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.radioButton input{-webkit-appearance:none;appearance:none}:host ::ng-deep .annotationLayer .popupTriggerArea{height:100%;width:100%}:host ::ng-deep .annotationLayer .popupWrapper{position:absolute;font-size:calc(9px * var(--scale-factor));width:100%;min-width:calc(180px * var(--scale-factor));pointer-events:none}:host ::ng-deep .annotationLayer .popup{position:absolute;max-width:calc(180px * var(--scale-factor));background-color:#ff9;box-shadow:0 calc(2px * var(--scale-factor)) calc(5px * var(--scale-factor)) #888;border-radius:calc(2px * var(--scale-factor));padding:calc(6px * var(--scale-factor));margin-left:calc(5px * var(--scale-factor));cursor:pointer;font:message-box;white-space:normal;word-wrap:break-word;pointer-events:auto}:host ::ng-deep .annotationLayer .popup>*{font-size:calc(9px * var(--scale-factor))}:host ::ng-deep .annotationLayer .popup h1{display:inline-block}:host ::ng-deep .annotationLayer .popupDate{display:inline-block;margin-left:calc(5px * var(--scale-factor))}:host ::ng-deep .annotationLayer .popupContent{border-top:1px solid rgb(51,51,51);margin-top:calc(2px * var(--scale-factor));padding-top:calc(2px * var(--scale-factor))}:host ::ng-deep .annotationLayer .richText>*{white-space:pre-wrap;font-size:calc(9px * var(--scale-factor))}:host ::ng-deep .annotationLayer .highlightAnnotation,:host ::ng-deep .annotationLayer .underlineAnnotation,:host ::ng-deep .annotationLayer .squigglyAnnotation,:host ::ng-deep .annotationLayer .strikeoutAnnotation,:host ::ng-deep .annotationLayer .freeTextAnnotation,:host ::ng-deep .annotationLayer .lineAnnotation svg line,:host ::ng-deep .annotationLayer .squareAnnotation svg rect,:host ::ng-deep .annotationLayer .circleAnnotation svg ellipse,:host ::ng-deep .annotationLayer .polylineAnnotation svg polyline,:host ::ng-deep .annotationLayer .polygonAnnotation svg polygon,:host ::ng-deep .annotationLayer .caretAnnotation,:host ::ng-deep .annotationLayer .inkAnnotation svg polyline,:host ::ng-deep .annotationLayer .stampAnnotation,:host ::ng-deep .annotationLayer .fileAttachmentAnnotation{cursor:pointer}:host ::ng-deep .annotationLayer section svg{position:absolute;width:100%;height:100%}:host ::ng-deep .annotationLayer .annotationTextContent{position:absolute;width:100%;height:100%;opacity:0;color:transparent;-webkit-user-select:none;user-select:none;pointer-events:none}:host ::ng-deep .annotationLayer .annotationTextContent span{width:100%;display:inline-block}@media (forced-colors: active){:host ::ng-deep .xfaLayer *:required{outline:1.5px solid selectedItem}}:host ::ng-deep .xfaLayer .highlight{margin:-1px;padding:1px;background-color:#efcbed;border-radius:4px}:host ::ng-deep .xfaLayer .highlight.appended{position:initial}:host ::ng-deep .xfaLayer .highlight.begin{border-radius:4px 0 0 4px}:host ::ng-deep .xfaLayer .highlight.end{border-radius:0 4px 4px 0}:host ::ng-deep .xfaLayer .highlight.middle{border-radius:0}:host ::ng-deep .xfaLayer .highlight.selected{background-color:#cbdfcb}:host ::ng-deep .xfaLayer ::selection{background:rgb(0,0,255)}:host ::ng-deep .xfaPage{overflow:hidden;position:relative}:host ::ng-deep .xfaContentarea{position:absolute}:host ::ng-deep .xfaPrintOnly{display:none}:host ::ng-deep .xfaLayer{position:absolute;text-align:initial;top:0;left:0;transform-origin:0 0;line-height:1.2}:host ::ng-deep .xfaLayer *{color:inherit;font:inherit;font-style:inherit;font-weight:inherit;font-kerning:inherit;letter-spacing:-.01px;text-align:inherit;text-decoration:inherit;box-sizing:border-box;background-color:transparent;padding:0;margin:0;pointer-events:auto;line-height:inherit}:host ::ng-deep .xfaLayer *:required{outline:1.5px solid red}:host ::ng-deep .xfaLayer div{pointer-events:none}:host ::ng-deep .xfaLayer svg{pointer-events:none}:host ::ng-deep .xfaLayer svg *{pointer-events:none}:host ::ng-deep .xfaLayer a{color:#00f}:host ::ng-deep .xfaRich li{margin-left:3em}:host ::ng-deep .xfaFont{color:#000;font-weight:400;font-kerning:none;font-size:10px;font-style:normal;letter-spacing:0;text-decoration:none;vertical-align:0}:host ::ng-deep .xfaCaption{overflow:hidden;flex:0 0 auto}:host ::ng-deep .xfaCaptionForCheckButton{overflow:hidden;flex:1 1 auto}:host ::ng-deep .xfaLabel{height:100%;width:100%}:host ::ng-deep .xfaLeft{display:flex;flex-direction:row;align-items:center}:host ::ng-deep .xfaRight{display:flex;flex-direction:row-reverse;align-items:center}:host ::ng-deep .xfaLeft>.xfaCaption,:host ::ng-deep .xfaLeft>.xfaCaptionForCheckButton,:host ::ng-deep .xfaRight>.xfaCaption,:host ::ng-deep .xfaRight>.xfaCaptionForCheckButton{max-height:100%}:host ::ng-deep .xfaTop{display:flex;flex-direction:column;align-items:flex-start}:host ::ng-deep .xfaBottom{display:flex;flex-direction:column-reverse;align-items:flex-start}:host ::ng-deep .xfaTop>.xfaCaption,:host ::ng-deep .xfaTop>.xfaCaptionForCheckButton,:host ::ng-deep .xfaBottom>.xfaCaption,:host ::ng-deep .xfaBottom>.xfaCaptionForCheckButton{width:100%}:host ::ng-deep .xfaBorder{background-color:transparent;position:absolute;pointer-events:none}:host ::ng-deep .xfaWrapped{width:100%;height:100%}:host ::ng-deep .xfaTextfield:focus,:host ::ng-deep .xfaSelect:focus{background-image:none;background-color:transparent;outline:auto;outline-offset:-1px}:host ::ng-deep .xfaCheckbox:focus,:host ::ng-deep .xfaRadio:focus{outline:auto}:host ::ng-deep .xfaTextfield,:host ::ng-deep .xfaSelect{height:100%;width:100%;flex:1 1 auto;border:none;resize:none;background-image:var(--xfa-unfocused-field-background)}:host ::ng-deep .xfaTop>.xfaTextfield,:host ::ng-deep .xfaTop>.xfaSelect,:host ::ng-deep .xfaBottom>.xfaTextfield,:host ::ng-deep .xfaBottom>.xfaSelect{flex:0 1 auto}:host ::ng-deep .xfaButton{cursor:pointer;width:100%;height:100%;border:none;text-align:center}:host ::ng-deep .xfaLink{width:100%;height:100%;position:absolute;top:0;left:0}:host ::ng-deep .xfaCheckbox,:host ::ng-deep .xfaRadio{width:100%;height:100%;flex:0 0 auto;border:none}:host ::ng-deep .xfaRich{white-space:pre-wrap;width:100%;height:100%}:host ::ng-deep .xfaImage{object-position:left top;object-fit:contain;width:100%;height:100%}:host ::ng-deep .xfaLrTb,:host ::ng-deep .xfaRlTb,:host ::ng-deep .xfaTb{display:flex;flex-direction:column;align-items:stretch}:host ::ng-deep .xfaLr{display:flex;flex-direction:row;align-items:stretch}:host ::ng-deep .xfaRl{display:flex;flex-direction:row-reverse;align-items:stretch}:host ::ng-deep .xfaTb>div{justify-content:left}:host ::ng-deep .xfaPosition{position:relative}:host ::ng-deep .xfaArea{position:relative}:host ::ng-deep .xfaValignMiddle{display:flex;align-items:center}:host ::ng-deep .xfaTable{display:flex;flex-direction:column;align-items:stretch}:host ::ng-deep .xfaTable .xfaRow{display:flex;flex-direction:row;align-items:stretch}:host ::ng-deep .xfaTable .xfaRlRow{display:flex;flex-direction:row-reverse;align-items:stretch;flex:1}:host ::ng-deep .xfaTable .xfaRlRow>div{flex:1}:host ::ng-deep .xfaNonInteractive input,:host ::ng-deep .xfaNonInteractive textarea,:host ::ng-deep .xfaDisabled input,:host ::ng-deep .xfaDisabled textarea,:host ::ng-deep .xfaReadOnly input,:host ::ng-deep .xfaReadOnly textarea{background:initial}@media print{:host ::ng-deep .xfaTextfield,:host ::ng-deep .xfaSelect{background:transparent}:host ::ng-deep .xfaSelect{-webkit-appearance:none;appearance:none;text-indent:1px;text-overflow:\"\"}}:host ::ng-deep [data-editor-rotation=\"90\"]{transform:rotate(90deg)}:host ::ng-deep [data-editor-rotation=\"180\"]{transform:rotate(180deg)}:host ::ng-deep [data-editor-rotation=\"270\"]{transform:rotate(270deg)}:host ::ng-deep .annotationEditorLayer{background:transparent;position:absolute;top:0;left:0;font-size:calc(100px * var(--scale-factor));transform-origin:0 0}:host ::ng-deep .annotationEditorLayer .selectedEditor{outline:var(--focus-outline);resize:none}:host ::ng-deep .annotationEditorLayer .freeTextEditor{position:absolute;background:transparent;border-radius:3px;padding:calc(var(--freetext-padding) * var(--scale-factor));resize:none;width:auto;height:auto;z-index:1;transform-origin:0 0;touch-action:none}:host ::ng-deep .annotationEditorLayer .freeTextEditor .internal{background:transparent;border:none;top:0;left:0;overflow:visible;white-space:nowrap;resize:none;font:10px sans-serif;line-height:var(--freetext-line-height)}:host ::ng-deep .annotationEditorLayer .freeTextEditor .overlay{position:absolute;display:none;background:transparent;top:0;left:0;width:100%;height:100%}:host ::ng-deep .annotationEditorLayer .freeTextEditor .overlay.enabled{display:block}:host ::ng-deep .annotationEditorLayer .freeTextEditor .internal:empty:before{content:attr(default-content);color:gray}:host ::ng-deep .annotationEditorLayer .freeTextEditor .internal:focus{outline:none}:host ::ng-deep .annotationEditorLayer .inkEditor.disabled{resize:none}:host ::ng-deep .annotationEditorLayer .inkEditor.disabled.selectedEditor{resize:horizontal}:host ::ng-deep .annotationEditorLayer .freeTextEditor:hover:not(.selectedEditor),:host ::ng-deep .annotationEditorLayer .inkEditor:hover:not(.selectedEditor){outline:var(--hover-outline)}:host ::ng-deep .annotationEditorLayer .inkEditor{position:absolute;background:transparent;border-radius:3px;overflow:auto;width:100%;height:100%;z-index:1;transform-origin:0 0;cursor:auto}:host ::ng-deep .annotationEditorLayer .inkEditor.editing{resize:none;cursor:var(--editorInk-editing-cursor),pointer}:host ::ng-deep .annotationEditorLayer .inkEditor .inkEditorCanvas{position:absolute;top:0;left:0;width:100%;height:100%;touch-action:none}:host ::ng-deep [data-main-rotation=\"90\"]{transform:rotate(90deg) translateY(-100%)}:host ::ng-deep [data-main-rotation=\"180\"]{transform:rotate(180deg) translate(-100%,-100%)}:host ::ng-deep [data-main-rotation=\"270\"]{transform:rotate(270deg) translate(-100%)}:host ::ng-deep .pdfViewer{padding-bottom:var(--pdfViewer-padding-bottom)}:host ::ng-deep .pdfViewer .canvasWrapper{overflow:hidden}:host ::ng-deep .pdfViewer .page{direction:ltr;width:816px;height:1056px;margin:var(--page-margin);position:relative;overflow:visible;border:var(--page-border);border-image:var(--page-border-image);background-clip:content-box;background-color:#fff}:host ::ng-deep .pdfViewer .dummyPage{position:relative;width:0;height:var(--viewer-container-height)}:host ::ng-deep .pdfViewer.removePageBorders .page{margin:0 auto 10px;border:none}:host ::ng-deep .pdfViewer.singlePageView{display:inline-block}:host ::ng-deep .pdfViewer.singlePageView .page{margin:0;border:none}:host ::ng-deep .pdfViewer.scrollHorizontal,:host ::ng-deep .pdfViewer.scrollWrapped,:host ::ng-deep .spread{margin-left:3.5px;margin-right:3.5px;text-align:center}:host ::ng-deep .pdfViewer.scrollHorizontal,:host ::ng-deep .spread{white-space:nowrap}:host ::ng-deep .pdfViewer.removePageBorders,:host ::ng-deep .pdfViewer.scrollHorizontal .spread,:host ::ng-deep .pdfViewer.scrollWrapped .spread{margin-left:0;margin-right:0}:host ::ng-deep .spread .page,:host ::ng-deep .spread .dummyPage,:host ::ng-deep .pdfViewer.scrollHorizontal .page,:host ::ng-deep .pdfViewer.scrollWrapped .page,:host ::ng-deep .pdfViewer.scrollHorizontal .spread,:host ::ng-deep .pdfViewer.scrollWrapped .spread{display:inline-block;vertical-align:middle}:host ::ng-deep .spread .page,:host ::ng-deep .pdfViewer.scrollHorizontal .page,:host ::ng-deep .pdfViewer.scrollWrapped .page{margin-left:var(--spreadHorizontalWrapped-margin-LR);margin-right:var(--spreadHorizontalWrapped-margin-LR)}:host ::ng-deep .pdfViewer.removePageBorders .spread .page,:host ::ng-deep .pdfViewer.removePageBorders.scrollHorizontal .page,:host ::ng-deep .pdfViewer.removePageBorders.scrollWrapped .page{margin-left:5px;margin-right:5px}:host ::ng-deep .pdfViewer .page canvas{margin:0;display:block}:host ::ng-deep .pdfViewer .page canvas[hidden]{display:none}:host ::ng-deep .pdfViewer .page .loadingIcon{position:absolute;display:block;inset:0;background:url(data:image/gif;base64,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) center no-repeat}:host ::ng-deep .pdfViewer .page .loadingIcon.notVisible{background:none}:host ::ng-deep .pdfViewer.enablePermissions .textLayer span{-webkit-user-select:none!important;user-select:none!important;cursor:not-allowed}:host ::ng-deep .pdfPresentationMode .pdfViewer{padding-bottom:0}:host ::ng-deep .pdfPresentationMode .spread{margin:0}:host ::ng-deep .pdfPresentationMode .pdfViewer .page{margin:0 auto;border:2px solid transparent}\n"] });
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "16.1.0", ngImport: i0, type: PdfViewerComponent, decorators: [{
            type: Component,
            args: [{ selector: 'pdf-viewer', template: `
    <div #pdfViewerContainer class="ng2-pdf-viewer-container">
      <div class="pdfViewer"></div>
    </div>
  `, styles: [".ng2-pdf-viewer-container{overflow-x:auto;position:absolute;height:100%;width:100%;-webkit-overflow-scrolling:touch}:host{display:block;position:relative}:host ::ng-deep{--pdfViewer-padding-bottom: 0;--page-margin: 1px auto -8px;--page-border: 9px solid transparent;--spreadHorizontalWrapped-margin-LR: -3.5px;--viewer-container-height: 0;--annotation-unfocused-field-background: url(\"data:image/svg+xml;charset=UTF-8,<svg width='1px' height='1px' xmlns='http://www.w3.org/2000/svg'><rect width='100%' height='100%' style='fill:rgba(0, 54, 255, 0.13);'/></svg>\");--xfa-unfocused-field-background: var( --annotation-unfocused-field-background );--page-border-image: url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABMAAAATCAYAAAByUDbMAAAA1ElEQVQ4jbWUWw6EIAxFy2NFs/8NzR4UJhpqLsdi5mOmSSMUOfYWqv3S0gMr4XlYH/64gZa/gN3ANYA7KAXALt4ktoQ5MI9YxqaG8bWmsIysMuT6piSQCa4whZThCu8CM4zP9YJaKci9jicPq3NcBWYoPMGUlhG7ivtkB+gVyFY75wXghOvh8t5mto1Mdim6e+MBqH6XsY+YAwjpq3vGF7weTWQptLEDVCZvPTMl5JZZsdh47FHW6qFMyvLYqjcnmdFfY9Xk/KDOlzCusX2mi/ofM7MPkzBcSp4Q1/wAAAAASUVORK5CYII=) 9 9 repeat;--scale-factor: 1;--focus-outline: solid 2px blue;--hover-outline: dashed 2px blue;--freetext-line-height: 1.35;--freetext-padding: 2px;--editorInk-editing-cursor: pointer}@media screen and (forced-colors: active){:host ::ng-deep{--pdfViewer-padding-bottom: 9px;--page-margin: 8px auto -1px;--page-border: 1px solid CanvasText;--page-border-image: none;--spreadHorizontalWrapped-margin-LR: 3.5px}}@media (forced-colors: active){:host ::ng-deep{--focus-outline: solid 3px ButtonText;--hover-outline: dashed 3px ButtonText}}:host ::ng-deep .textLayer{position:absolute;text-align:initial;inset:0;overflow:hidden;opacity:.2;line-height:1;-webkit-text-size-adjust:none;text-size-adjust:none;forced-color-adjust:none;transform-origin:0 0}:host ::ng-deep .textLayer span,:host ::ng-deep .textLayer br{color:transparent;position:absolute;white-space:pre;cursor:text;transform-origin:0% 0%}:host ::ng-deep .textLayer span.markedContent{top:0;height:0}:host ::ng-deep .textLayer .highlight{margin:-1px;padding:1px;background-color:#b400aa;border-radius:4px}:host ::ng-deep .textLayer .highlight.appended{position:initial}:host ::ng-deep .textLayer .highlight.begin{border-radius:4px 0 0 4px}:host ::ng-deep .textLayer .highlight.end{border-radius:0 4px 4px 0}:host ::ng-deep .textLayer .highlight.middle{border-radius:0}:host ::ng-deep .textLayer .highlight.selected{background-color:#006400}:host ::ng-deep .textLayer ::selection{background:rgb(0,0,255)}:host ::ng-deep .textLayer br::selection{background:transparent}:host ::ng-deep .textLayer .endOfContent{display:block;position:absolute;inset:100% 0 0;z-index:-1;cursor:default;-webkit-user-select:none;user-select:none}:host ::ng-deep .textLayer .endOfContent.active{top:0}@media (forced-colors: active){:host ::ng-deep .annotationLayer .textWidgetAnnotation input:required,:host ::ng-deep .annotationLayer .textWidgetAnnotation textarea:required,:host ::ng-deep .annotationLayer .choiceWidgetAnnotation select:required,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input:required,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.radioButton input:required{outline:1.5px solid selectedItem}}:host ::ng-deep .annotationLayer{position:absolute;top:0;left:0;pointer-events:none;transform-origin:0 0}:host ::ng-deep .annotationLayer section{position:absolute;text-align:initial;pointer-events:auto;box-sizing:border-box;transform-origin:0 0}:host ::ng-deep .annotationLayer .linkAnnotation>a,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.pushButton>a{position:absolute;font-size:1em;top:0;left:0;width:100%;height:100%}:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.pushButton>canvas{width:100%;height:100%}:host ::ng-deep .annotationLayer .linkAnnotation>a:hover,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.pushButton>a:hover{opacity:.2;background:rgb(255,255,0);box-shadow:0 2px 10px #ff0}:host ::ng-deep .annotationLayer .textAnnotation img{position:absolute;cursor:pointer;width:100%;height:100%}:host ::ng-deep .annotationLayer .textWidgetAnnotation input,:host ::ng-deep .annotationLayer .textWidgetAnnotation textarea,:host ::ng-deep .annotationLayer .choiceWidgetAnnotation select,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.radioButton input{background-image:var(--annotation-unfocused-field-background);border:1px solid transparent;box-sizing:border-box;font:calc(9px * var(--scale-factor)) sans-serif;height:100%;margin:0;vertical-align:top;width:100%}:host ::ng-deep .annotationLayer .textWidgetAnnotation input:required,:host ::ng-deep .annotationLayer .textWidgetAnnotation textarea:required,:host ::ng-deep .annotationLayer .choiceWidgetAnnotation select:required,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input:required,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.radioButton input:required{outline:1.5px solid red}:host ::ng-deep .annotationLayer .choiceWidgetAnnotation select option{padding:0}:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.radioButton input{border-radius:50%}:host ::ng-deep .annotationLayer .textWidgetAnnotation textarea{resize:none}:host ::ng-deep .annotationLayer .textWidgetAnnotation input[disabled],:host ::ng-deep .annotationLayer .textWidgetAnnotation textarea[disabled],:host ::ng-deep .annotationLayer .choiceWidgetAnnotation select[disabled],:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input[disabled],:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.radioButton input[disabled]{background:none;border:1px solid transparent;cursor:not-allowed}:host ::ng-deep .annotationLayer .textWidgetAnnotation input:hover,:host ::ng-deep .annotationLayer .textWidgetAnnotation textarea:hover,:host ::ng-deep .annotationLayer .choiceWidgetAnnotation select:hover,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input:hover,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.radioButton input:hover{border:1px solid rgb(0,0,0)}:host ::ng-deep .annotationLayer .textWidgetAnnotation input:focus,:host ::ng-deep .annotationLayer .textWidgetAnnotation textarea:focus,:host ::ng-deep .annotationLayer .choiceWidgetAnnotation select:focus{background:none;border:1px solid transparent}:host ::ng-deep .annotationLayer .textWidgetAnnotation input :focus,:host ::ng-deep .annotationLayer .textWidgetAnnotation textarea :focus,:host ::ng-deep .annotationLayer .choiceWidgetAnnotation select :focus,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox :focus,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.radioButton :focus{background-image:none;background-color:transparent;outline:auto}:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input:checked:before,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input:checked:after,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.radioButton input:checked:before{background-color:CanvasText;content:\"\";display:block;position:absolute}:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input:checked:before,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input:checked:after{height:80%;left:45%;width:1px}:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input:checked:before{transform:rotate(45deg)}:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input:checked:after{transform:rotate(-45deg)}:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.radioButton input:checked:before{border-radius:50%;height:50%;left:30%;top:20%;width:50%}:host ::ng-deep .annotationLayer .textWidgetAnnotation input.comb{font-family:monospace;padding-left:2px;padding-right:0}:host ::ng-deep .annotationLayer .textWidgetAnnotation input.comb:focus{width:103%}:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.radioButton input{-webkit-appearance:none;appearance:none}:host ::ng-deep .annotationLayer .popupTriggerArea{height:100%;width:100%}:host ::ng-deep .annotationLayer .popupWrapper{position:absolute;font-size:calc(9px * var(--scale-factor));width:100%;min-width:calc(180px * var(--scale-factor));pointer-events:none}:host ::ng-deep .annotationLayer .popup{position:absolute;max-width:calc(180px * var(--scale-factor));background-color:#ff9;box-shadow:0 calc(2px * var(--scale-factor)) calc(5px * var(--scale-factor)) #888;border-radius:calc(2px * var(--scale-factor));padding:calc(6px * var(--scale-factor));margin-left:calc(5px * var(--scale-factor));cursor:pointer;font:message-box;white-space:normal;word-wrap:break-word;pointer-events:auto}:host ::ng-deep .annotationLayer .popup>*{font-size:calc(9px * var(--scale-factor))}:host ::ng-deep .annotationLayer .popup h1{display:inline-block}:host ::ng-deep .annotationLayer .popupDate{display:inline-block;margin-left:calc(5px * var(--scale-factor))}:host ::ng-deep .annotationLayer .popupContent{border-top:1px solid rgb(51,51,51);margin-top:calc(2px * var(--scale-factor));padding-top:calc(2px * var(--scale-factor))}:host ::ng-deep .annotationLayer .richText>*{white-space:pre-wrap;font-size:calc(9px * var(--scale-factor))}:host ::ng-deep .annotationLayer .highlightAnnotation,:host ::ng-deep .annotationLayer .underlineAnnotation,:host ::ng-deep .annotationLayer .squigglyAnnotation,:host ::ng-deep .annotationLayer .strikeoutAnnotation,:host ::ng-deep .annotationLayer .freeTextAnnotation,:host ::ng-deep .annotationLayer .lineAnnotation svg line,:host ::ng-deep .annotationLayer .squareAnnotation svg rect,:host ::ng-deep .annotationLayer .circleAnnotation svg ellipse,:host ::ng-deep .annotationLayer .polylineAnnotation svg polyline,:host ::ng-deep .annotationLayer .polygonAnnotation svg polygon,:host ::ng-deep .annotationLayer .caretAnnotation,:host ::ng-deep .annotationLayer .inkAnnotation svg polyline,:host ::ng-deep .annotationLayer .stampAnnotation,:host ::ng-deep .annotationLayer .fileAttachmentAnnotation{cursor:pointer}:host ::ng-deep .annotationLayer section svg{position:absolute;width:100%;height:100%}:host ::ng-deep .annotationLayer .annotationTextContent{position:absolute;width:100%;height:100%;opacity:0;color:transparent;-webkit-user-select:none;user-select:none;pointer-events:none}:host ::ng-deep .annotationLayer .annotationTextContent span{width:100%;display:inline-block}@media (forced-colors: active){:host ::ng-deep .xfaLayer *:required{outline:1.5px solid selectedItem}}:host ::ng-deep .xfaLayer .highlight{margin:-1px;padding:1px;background-color:#efcbed;border-radius:4px}:host ::ng-deep .xfaLayer .highlight.appended{position:initial}:host ::ng-deep .xfaLayer .highlight.begin{border-radius:4px 0 0 4px}:host ::ng-deep .xfaLayer .highlight.end{border-radius:0 4px 4px 0}:host ::ng-deep .xfaLayer .highlight.middle{border-radius:0}:host ::ng-deep .xfaLayer .highlight.selected{background-color:#cbdfcb}:host ::ng-deep .xfaLayer ::selection{background:rgb(0,0,255)}:host ::ng-deep .xfaPage{overflow:hidden;position:relative}:host ::ng-deep .xfaContentarea{position:absolute}:host ::ng-deep .xfaPrintOnly{display:none}:host ::ng-deep .xfaLayer{position:absolute;text-align:initial;top:0;left:0;transform-origin:0 0;line-height:1.2}:host ::ng-deep .xfaLayer *{color:inherit;font:inherit;font-style:inherit;font-weight:inherit;font-kerning:inherit;letter-spacing:-.01px;text-align:inherit;text-decoration:inherit;box-sizing:border-box;background-color:transparent;padding:0;margin:0;pointer-events:auto;line-height:inherit}:host ::ng-deep .xfaLayer *:required{outline:1.5px solid red}:host ::ng-deep .xfaLayer div{pointer-events:none}:host ::ng-deep .xfaLayer svg{pointer-events:none}:host ::ng-deep .xfaLayer svg *{pointer-events:none}:host ::ng-deep .xfaLayer a{color:#00f}:host ::ng-deep .xfaRich li{margin-left:3em}:host ::ng-deep .xfaFont{color:#000;font-weight:400;font-kerning:none;font-size:10px;font-style:normal;letter-spacing:0;text-decoration:none;vertical-align:0}:host ::ng-deep .xfaCaption{overflow:hidden;flex:0 0 auto}:host ::ng-deep .xfaCaptionForCheckButton{overflow:hidden;flex:1 1 auto}:host ::ng-deep .xfaLabel{height:100%;width:100%}:host ::ng-deep .xfaLeft{display:flex;flex-direction:row;align-items:center}:host ::ng-deep .xfaRight{display:flex;flex-direction:row-reverse;align-items:center}:host ::ng-deep .xfaLeft>.xfaCaption,:host ::ng-deep .xfaLeft>.xfaCaptionForCheckButton,:host ::ng-deep .xfaRight>.xfaCaption,:host ::ng-deep .xfaRight>.xfaCaptionForCheckButton{max-height:100%}:host ::ng-deep .xfaTop{display:flex;flex-direction:column;align-items:flex-start}:host ::ng-deep .xfaBottom{display:flex;flex-direction:column-reverse;align-items:flex-start}:host ::ng-deep .xfaTop>.xfaCaption,:host ::ng-deep .xfaTop>.xfaCaptionForCheckButton,:host ::ng-deep .xfaBottom>.xfaCaption,:host ::ng-deep .xfaBottom>.xfaCaptionForCheckButton{width:100%}:host ::ng-deep .xfaBorder{background-color:transparent;position:absolute;pointer-events:none}:host ::ng-deep .xfaWrapped{width:100%;height:100%}:host ::ng-deep .xfaTextfield:focus,:host ::ng-deep .xfaSelect:focus{background-image:none;background-color:transparent;outline:auto;outline-offset:-1px}:host ::ng-deep .xfaCheckbox:focus,:host ::ng-deep .xfaRadio:focus{outline:auto}:host ::ng-deep .xfaTextfield,:host ::ng-deep .xfaSelect{height:100%;width:100%;flex:1 1 auto;border:none;resize:none;background-image:var(--xfa-unfocused-field-background)}:host ::ng-deep .xfaTop>.xfaTextfield,:host ::ng-deep .xfaTop>.xfaSelect,:host ::ng-deep .xfaBottom>.xfaTextfield,:host ::ng-deep .xfaBottom>.xfaSelect{flex:0 1 auto}:host ::ng-deep .xfaButton{cursor:pointer;width:100%;height:100%;border:none;text-align:center}:host ::ng-deep .xfaLink{width:100%;height:100%;position:absolute;top:0;left:0}:host ::ng-deep .xfaCheckbox,:host ::ng-deep .xfaRadio{width:100%;height:100%;flex:0 0 auto;border:none}:host ::ng-deep .xfaRich{white-space:pre-wrap;width:100%;height:100%}:host ::ng-deep .xfaImage{object-position:left top;object-fit:contain;width:100%;height:100%}:host ::ng-deep .xfaLrTb,:host ::ng-deep .xfaRlTb,:host ::ng-deep .xfaTb{display:flex;flex-direction:column;align-items:stretch}:host ::ng-deep .xfaLr{display:flex;flex-direction:row;align-items:stretch}:host ::ng-deep .xfaRl{display:flex;flex-direction:row-reverse;align-items:stretch}:host ::ng-deep .xfaTb>div{justify-content:left}:host ::ng-deep .xfaPosition{position:relative}:host ::ng-deep .xfaArea{position:relative}:host ::ng-deep .xfaValignMiddle{display:flex;align-items:center}:host ::ng-deep .xfaTable{display:flex;flex-direction:column;align-items:stretch}:host ::ng-deep .xfaTable .xfaRow{display:flex;flex-direction:row;align-items:stretch}:host ::ng-deep .xfaTable .xfaRlRow{display:flex;flex-direction:row-reverse;align-items:stretch;flex:1}:host ::ng-deep .xfaTable .xfaRlRow>div{flex:1}:host ::ng-deep .xfaNonInteractive input,:host ::ng-deep .xfaNonInteractive textarea,:host ::ng-deep .xfaDisabled input,:host ::ng-deep .xfaDisabled textarea,:host ::ng-deep .xfaReadOnly input,:host ::ng-deep .xfaReadOnly textarea{background:initial}@media print{:host ::ng-deep .xfaTextfield,:host ::ng-deep .xfaSelect{background:transparent}:host ::ng-deep .xfaSelect{-webkit-appearance:none;appearance:none;text-indent:1px;text-overflow:\"\"}}:host ::ng-deep [data-editor-rotation=\"90\"]{transform:rotate(90deg)}:host ::ng-deep [data-editor-rotation=\"180\"]{transform:rotate(180deg)}:host ::ng-deep [data-editor-rotation=\"270\"]{transform:rotate(270deg)}:host ::ng-deep .annotationEditorLayer{background:transparent;position:absolute;top:0;left:0;font-size:calc(100px * var(--scale-factor));transform-origin:0 0}:host ::ng-deep .annotationEditorLayer .selectedEditor{outline:var(--focus-outline);resize:none}:host ::ng-deep .annotationEditorLayer .freeTextEditor{position:absolute;background:transparent;border-radius:3px;padding:calc(var(--freetext-padding) * var(--scale-factor));resize:none;width:auto;height:auto;z-index:1;transform-origin:0 0;touch-action:none}:host ::ng-deep .annotationEditorLayer .freeTextEditor .internal{background:transparent;border:none;top:0;left:0;overflow:visible;white-space:nowrap;resize:none;font:10px sans-serif;line-height:var(--freetext-line-height)}:host ::ng-deep .annotationEditorLayer .freeTextEditor .overlay{position:absolute;display:none;background:transparent;top:0;left:0;width:100%;height:100%}:host ::ng-deep .annotationEditorLayer .freeTextEditor .overlay.enabled{display:block}:host ::ng-deep .annotationEditorLayer .freeTextEditor .internal:empty:before{content:attr(default-content);color:gray}:host ::ng-deep .annotationEditorLayer .freeTextEditor .internal:focus{outline:none}:host ::ng-deep .annotationEditorLayer .inkEditor.disabled{resize:none}:host ::ng-deep .annotationEditorLayer .inkEditor.disabled.selectedEditor{resize:horizontal}:host ::ng-deep .annotationEditorLayer .freeTextEditor:hover:not(.selectedEditor),:host ::ng-deep .annotationEditorLayer .inkEditor:hover:not(.selectedEditor){outline:var(--hover-outline)}:host ::ng-deep .annotationEditorLayer .inkEditor{position:absolute;background:transparent;border-radius:3px;overflow:auto;width:100%;height:100%;z-index:1;transform-origin:0 0;cursor:auto}:host ::ng-deep .annotationEditorLayer .inkEditor.editing{resize:none;cursor:var(--editorInk-editing-cursor),pointer}:host ::ng-deep .annotationEditorLayer .inkEditor .inkEditorCanvas{position:absolute;top:0;left:0;width:100%;height:100%;touch-action:none}:host ::ng-deep [data-main-rotation=\"90\"]{transform:rotate(90deg) translateY(-100%)}:host ::ng-deep [data-main-rotation=\"180\"]{transform:rotate(180deg) translate(-100%,-100%)}:host ::ng-deep [data-main-rotation=\"270\"]{transform:rotate(270deg) translate(-100%)}:host ::ng-deep .pdfViewer{padding-bottom:var(--pdfViewer-padding-bottom)}:host ::ng-deep .pdfViewer .canvasWrapper{overflow:hidden}:host ::ng-deep .pdfViewer .page{direction:ltr;width:816px;height:1056px;margin:var(--page-margin);position:relative;overflow:visible;border:var(--page-border);border-image:var(--page-border-image);background-clip:content-box;background-color:#fff}:host ::ng-deep .pdfViewer .dummyPage{position:relative;width:0;height:var(--viewer-container-height)}:host ::ng-deep .pdfViewer.removePageBorders .page{margin:0 auto 10px;border:none}:host ::ng-deep .pdfViewer.singlePageView{display:inline-block}:host ::ng-deep .pdfViewer.singlePageView .page{margin:0;border:none}:host ::ng-deep .pdfViewer.scrollHorizontal,:host ::ng-deep .pdfViewer.scrollWrapped,:host ::ng-deep .spread{margin-left:3.5px;margin-right:3.5px;text-align:center}:host ::ng-deep .pdfViewer.scrollHorizontal,:host ::ng-deep .spread{white-space:nowrap}:host ::ng-deep .pdfViewer.removePageBorders,:host ::ng-deep .pdfViewer.scrollHorizontal .spread,:host ::ng-deep .pdfViewer.scrollWrapped .spread{margin-left:0;margin-right:0}:host ::ng-deep .spread .page,:host ::ng-deep .spread .dummyPage,:host ::ng-deep .pdfViewer.scrollHorizontal .page,:host ::ng-deep .pdfViewer.scrollWrapped .page,:host ::ng-deep .pdfViewer.scrollHorizontal .spread,:host ::ng-deep .pdfViewer.scrollWrapped .spread{display:inline-block;vertical-align:middle}:host ::ng-deep .spread .page,:host ::ng-deep .pdfViewer.scrollHorizontal .page,:host ::ng-deep .pdfViewer.scrollWrapped .page{margin-left:var(--spreadHorizontalWrapped-margin-LR);margin-right:var(--spreadHorizontalWrapped-margin-LR)}:host ::ng-deep .pdfViewer.removePageBorders .spread .page,:host ::ng-deep .pdfViewer.removePageBorders.scrollHorizontal .page,:host ::ng-deep .pdfViewer.removePageBorders.scrollWrapped .page{margin-left:5px;margin-right:5px}:host ::ng-deep .pdfViewer .page canvas{margin:0;display:block}:host ::ng-deep .pdfViewer .page canvas[hidden]{display:none}:host ::ng-deep .pdfViewer .page .loadingIcon{position:absolute;display:block;inset:0;background:url(data:image/gif;base64,R0lGODlhGAAYAPQQAM7Ozvr6+uDg4LCwsOjo6I6OjsjIyJycnNjY2KioqMDAwPLy8nZ2doaGhri4uGhoaP///wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh/ilPcHRpbWl6ZWQgd2l0aCBodHRwczovL2V6Z2lmLmNvbS9vcHRpbWl6ZQAh+QQJBwAQACwAAAAAGAAYAAAFmiAkjiTkOGVaBgjZNGSgkgKjjM8zLoI8iy+BKCdiCX8iBeMAhEEIPRXLxViYUE9CbCQoFAzFhHY3zkaT3oPvBz1zE4UBsr1eWZH4vAowOBwGAHk8AoQLfH6Agm0Ed3qOAXWOIgQKiWyFJQgDgJEpdG+WEACNEFNFmKVlVzJQk6qdkwqBoi1mebJ3ALNGeIZHtGSwNDS1RZKueCEAIfkECQcAEAAsAAAAABgAGAAABZcgJI4kpChlWgYCWRQkEKgjURgjw4zOg9CjVwuiEyEeO6CxkBC9nA+HiuUqLEyoBZI0Mx4SAFFgQCDZuguBoGv6Dtg0gvpqdhxQQDkBzuUr/4A1JwMKP39pc2mDhYCIc4GQYn6QCwCMeY91l0p6dBAEJ0OfcFRimZ91Mwt0alxxAIZyRmuAsKxDLKKvZbM1tJxmvGKRpn8hACH5BAkHABAALAAAAAAYABgAAAWhICSOJGQYZVoGAnkcJBKoI3EAY1GMCtPSosSBINKJBIwGkHdwBGGQA0OhYpEGQxNqkYzNIITBACEKKBaxxNfBeOCO4vMy0Hg8nDHFeCktkKtfNAtoS4UqAicKBj9zBAKPC4iKi4aRkISGmWWBmjUIAIyHkCUEAKCVo2WmREecVqoCgZhgP4NHrGWCj7e3szSpuxAsoVWxnp6cVV4kyZW+KSEAIfkECQcAEAAsAAAAABgAGAAABZkgJI4kBABlWgYEOQykEKgjMSDjcYxG0dKi108nEhQKQN4rCIMkCgbawjWYnSCLY2yGVSgEooBhWqsGGwxc0RtNBgoMhmJ1QgETjANYFeBKyUmBKQQIdT9JDmgPDQ6EhoKJD4sOgpWWgiwChyqEBH5hmptSoSOZgJ4kLKWkYTF7C2SaqaM/hEWygay4mYG8t6uffFuzl1iANCEAIfkECQcAEAAsAAAAABgAGAAABZ0gJI4khCBlmhKkopBCoI6LIozDMAIHO4uuBVBnOiR+I4FrCDwAZsKdQnaCLIwwmRUA8JmioprWUCjcwlwUMnAoG0qL03k2KCS8cC0UjOzDCQKBfHQFDAwFU4CCfgqFhy9+kZJWgzSKSAcPZn+BfQENDw8OljGWJAFeDoZPYTBnC1GdSXqnsoBolSulX2GyP6hgvnG0KrS3NJNhuSQhACH5BAkHABAALAAAAAAYABgAAAWaICSOJCQIZZoupGGQRKCOC0CMijIiwz2LABtQZxoMfjQhxAXszWQ7gOwECRhh0MCJJRJARTUoIHFAgbfI6uBwAJS01J/i4PClVYHvfV8lbLlIBmwFbQt+aGmChG18jXeGT4dICQxlb4g/AQUMDER9XjR6BAdiDQwINDBmkAsPDVh4cX4imw53iLKuaVqAcUsPqEiidkt6j4AzIQAh+QQJBwAQACwAAAAAGAAYAAAFmSAkjiREEGWaBiSCtCoZCMsIAKOg1LEo0KKbaKFQ9EYLoOkFuQlirNxzCQkUW9GZ0hQd4nyDAWr4G/esYSbyZFYZwu3jqiuvr8u8I2BwOAwASXh1e31/doeHC3klWnElfAlTd46MfQUGk2stCVEGBQWSdCciDg5VDAVYKoEiDQ0iBwxGcj9RDw8+qHIzebc2DJJQJK6qiKVyIQAh+QQJBwAQACwAAAAAGAAYAAAFmSAkjiS0LGWaBiRBtCoZCKgoCCMB1DF0sz6cCQDo5W62l28XAyZFpyECBv3lnCbhUqHMIo0Qg4Jbmn1jRCa4iV27TzfXGjEecOFWMN1OdvvfPGUuXSoKBw6EXokrAwcHRVU0UAeEBANAAAmUI1gNDyhjJgUHLW0iDg8FIqOnBQZrDA9TELE2rEYIDw4jta2LMpCrqld/YQpgIQAh+QQJBwAQACwAAAAAGAAYAAAFmyAkjiS0LGWaBiRBkKw6BgIqCsJcyyMe4yJajhcEml5H26o1PN2QQd3uFiv2AADlAgflIbDdZLgkABOJgep5LfWty4p4zeU+w+XsvJWXliEKDwdEBgMKYQ4PDw1qK3EDCCMAiQ5BCV0LCj+FSDQkgCgGBiYHAy2MIgoMghAHqw4HAGsNDEMFBTekdgwKI7aRB2MwkL2rVHoQoWchACH5BAkHABAALAAAAAAYABgAAAWWICSOJLQsZZoGJEGQrDoGAioKwlzLIx7jIlqOFwSaXkfbqjU83ZBB3e4WK0qrCxyU55peid0qcUwuixyNx6PhILsAcAJazXYj4lvz2MkLiFsHDAlEcABKZwwMBX8pBgoKQxAIigpBA1sLBj+PSDQkB4uSACYDlTMyBgWDEKVnl2QFBUigN61gBQYjtLV5JZ4jtlR6omMhACH5BAkHABAALAAAAAAYABgAAAWaICSOJLQsZZoGJEGQrDoGAioKwlzLIx7jIlqOFwSaXkdbidYanm7I4AjwYDh6saJuJ3JUG1mZi9srPA7EcRimJLrfJYWZUVC8TziXnEG3u/E+cIJaPAFrPQl1aQAIbRAGBZGHJQiMUQKRBkEKbQsAPZaEXQcslSYKmjMyAAdXj34ACkNEiUgDA5t+PAQHn6Ogjkuzry2DNwhuIQAh+QQFBwAQACwAAAAAGAAYAAAFnCAkjiS0LGVaBgBJEGSguo8zCsK4CPIsMg+ECCcKEH0ix6MwhJl4KiOp8UCdmrEbo6EoHpxF8A6aBBZ6vhf5dmAkkGr0CoWs21WGQ2FvsI9xC3l7B311fy93iWGKJQQOhHCAJQB6A3IqcWwJLU90i2FkUiMKlhBELEI6MwgDXRAGhQgAYD6tTqRFAJxpA6mvrqazSKJJhUWMpjlIIQA7) center no-repeat}:host ::ng-deep .pdfViewer .page .loadingIcon.notVisible{background:none}:host ::ng-deep .pdfViewer.enablePermissions .textLayer span{-webkit-user-select:none!important;user-select:none!important;cursor:not-allowed}:host ::ng-deep .pdfPresentationMode .pdfViewer{padding-bottom:0}:host ::ng-deep .pdfPresentationMode .spread{margin:0}:host ::ng-deep .pdfPresentationMode .pdfViewer .page{margin:0 auto;border:2px solid transparent}\n"] }]
        }], ctorParameters: function () { return [{ type: i0.ElementRef }, { type: i0.NgZone }]; }, propDecorators: { pdfViewerContainer: [{
                type: ViewChild,
                args: ['pdfViewerContainer']
            }], afterLoadComplete: [{
                type: Output,
                args: ['after-load-complete']
            }], pageRendered: [{
                type: Output,
                args: ['page-rendered']
            }], pageInitialized: [{
                type: Output,
                args: ['pages-initialized']
            }], textLayerRendered: [{
                type: Output,
                args: ['text-layer-rendered']
            }], onError: [{
                type: Output,
                args: ['error']
            }], onProgress: [{
                type: Output,
                args: ['on-progress']
            }], pageChange: [{
                type: Output
            }], src: [{
                type: Input
            }], cMapsUrl: [{
                type: Input,
                args: ['c-maps-url']
            }], page: [{
                type: Input,
                args: ['page']
            }], renderText: [{
                type: Input,
                args: ['render-text']
            }], renderTextMode: [{
                type: Input,
                args: ['render-text-mode']
            }], originalSize: [{
                type: Input,
                args: ['original-size']
            }], showAll: [{
                type: Input,
                args: ['show-all']
            }], stickToPage: [{
                type: Input,
                args: ['stick-to-page']
            }], zoom: [{
                type: Input,
                args: ['zoom']
            }], zoomScale: [{
                type: Input,
                args: ['zoom-scale']
            }], rotation: [{
                type: Input,
                args: ['rotation']
            }], externalLinkTarget: [{
                type: Input,
                args: ['external-link-target']
            }], autoresize: [{
                type: Input,
                args: ['autoresize']
            }], fitToPage: [{
                type: Input,
                args: ['fit-to-page']
            }], showBorders: [{
                type: Input,
                args: ['show-borders']
            }] } });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGRmLXZpZXdlci5jb21wb25lbnQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi9zcmMvYXBwL3BkZi12aWV3ZXIvcGRmLXZpZXdlci5jb21wb25lbnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7O0dBRUc7QUFDSCxPQUFPLEVBQ0wsU0FBUyxFQUNULEtBQUssRUFDTCxNQUFNLEVBRU4sWUFBWSxFQUtaLFNBQVMsRUFHVixNQUFNLGVBQWUsQ0FBQztBQUN2QixPQUFPLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxPQUFPLEVBQUUsTUFBTSxNQUFNLENBQUM7QUFDaEQsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLE1BQU0sZ0JBQWdCLENBQUM7QUFDakUsT0FBTyxLQUFLLEtBQUssTUFBTSxZQUFZLENBQUM7QUFDcEMsT0FBTyxLQUFLLFdBQVcsTUFBTSwrQkFBK0IsQ0FBQztBQUU3RCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDMUQsT0FBTyxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQkFBa0IsQ0FBQztBQVdqRCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsY0FBYyxFQUFFLFdBQVcsRUFBRSxNQUFNLFlBQVksQ0FBQzs7QUFHOUUsSUFBSSxDQUFDLEtBQUssRUFBRSxFQUFFO0lBQ1osTUFBTSxDQUFDLEtBQUssRUFBRSxXQUFXLEVBQUUsY0FBYyxDQUFDLEtBQUssQ0FBQyxDQUFDO0NBQ2xEO0FBRUQsK0VBQStFO0FBQy9FLElBQUksT0FBTyxPQUFPLENBQUMsYUFBYSxLQUFLLFdBQVcsSUFBSSxNQUFNLEVBQUU7SUFDMUQsK0VBQStFO0lBQy9FLE1BQU0sQ0FBQyxPQUFPLENBQUMsYUFBYSxHQUFHLEdBQUcsRUFBRTtRQUNsQyxJQUFJLE9BQU8sQ0FBQztRQUNaLElBQUksTUFBTSxDQUFDO1FBQ1gsTUFBTSxPQUFPLEdBQUcsSUFBSSxPQUFP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QjtnQkFNekIsVUFBVTtzQkFEYixLQUFLO3VCQUFDLFlBQVk7Z0JBTWYsU0FBUztzQkFEWixLQUFLO3VCQUFDLGFBQWE7Z0JBTWhCLFdBQVc7c0JBRGQsS0FBSzt1QkFBQyxjQUFjIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBDcmVhdGVkIGJ5IHZhZGltZGV6IG9uIDIxLzA2LzE2LlxuICovXG5pbXBvcnQge1xuICBDb21wb25lbnQsXG4gIElucHV0LFxuICBPdXRwdXQsXG4gIEVsZW1lbnRSZWYsXG4gIEV2ZW50RW1pdHRlcixcbiAgT25DaGFuZ2VzLFxuICBTaW1wbGVDaGFuZ2VzLFxuICBPbkluaXQsXG4gIE9uRGVzdHJveSxcbiAgVmlld0NoaWxkLFxuICBBZnRlclZpZXdDaGVja2VkLFxuICBOZ1pvbmVcbn0gZnJvbSAnQGFuZ3VsYXIvY29yZSc7XG5pbXBvcnQgeyBmcm9tLCBmcm9tRXZlbnQsIFN1YmplY3QgfSBmcm9tICdyeGpzJztcbmltcG9ydCB7IGRlYm91bmNlVGltZSwgZmlsdGVyLCB0YWtlVW50aWwgfSBmcm9tICdyeGpzL29wZXJhdG9ycyc7XG5pbXBvcnQgKiBhcyBQREZKUyBmcm9tICdwZGZqcy1kaXN0JztcbmltcG9ydCAqIGFzIFBERkpTVmlld2VyIGZyb20gJ3BkZmpzLWRpc3Qvd2ViL3BkZl92aWV3ZXIubWpzJztcblxuaW1wb3J0IHsgY3JlYXRlRXZlbnRCdXMgfSBmcm9tICcuLi91dGlscy9ldmVudC1idXMtdXRpbHMnO1xuaW1wb3J0IHsgYXNzaWduLCBpc1NTUiB9IGZyb20gJy4uL3V0aWxzL2hlbHBlcnMnO1xuXG5pbXBvcnQgdHlwZSB7XG4gIFBERlNvdXJjZSxcbiAgUERGUGFnZVByb3h5LFxuICBQREZQcm9ncmVzc0RhdGEsXG4gIFBERkRvY3VtZW50UHJveHksXG4gIFBERkRvY3VtZW50TG9hZGluZ1Rhc2ssXG4gIFBERlZpZXdlck9wdGlvbnMsXG4gIFpvb21TY2FsZVxufSBmcm9tICcuL3R5cGluZ3MnO1xuaW1wb3J0IHsgR2xvYmFsV29ya2VyT3B0aW9ucywgVmVyYm9zaXR5TGV2ZWwsIGdldERvY3VtZW50IH0gZnJvbSAncGRmanMtZGlzdCc7XG5cblxuaWYgKCFpc1NTUigpKSB7XG4gIGFzc2lnbihQREZKUywgJ3ZlcmJvc2l0eScsIFZlcmJvc2l0eUxldmVsLklORk9TKTtcbn1cblxuLy8gQHRzLWV4cGVjdC1lcnJvciBUaGlzIGRvZXMgbm90IGV4aXN0IG91dHNpZGUgb2YgcG9seWZpbGwgd2hpY2ggdGhpcyBpcyBkb2luZ1xuaWYgKHR5cGVvZiBQcm9taXNlLndpdGhSZXNvbHZlcnMgPT09ICd1bmRlZmluZWQnICYmIHdpbmRvdykge1xuICAvLyBAdHMtZXhwZWN0LWVycm9yIFRoaXMgZG9lcyBub3QgZXhpc3Qgb3V0c2lkZSBvZiBwb2x5ZmlsbCB3aGljaCB0aGlzIGlzIGRvaW5nXG4gIHdpbmRvdy5Qcm9taXNlLndpdGhSZXNvbHZlcnMgPSAoKSA9PiB7XG4gICAgbGV0IHJlc29sdmU7XG4gICAgbGV0IHJlamVjdDtcbiAgICBjb25zdCBwcm9taXNlID0gbmV3IFByb21pc2UoKHJlcywgcmVqKSA9PiB7XG4gICAgICByZXNvbHZlID0gcmVzO1xuICAgICAgcmVqZWN0ID0gcmVqO1xuICAgIH0pO1xuICAgIHJldHVybiB7IHByb21pc2UsIHJlc29sdmUsIHJlamVjdCB9O1xuICB9O1xufVxuXG5cbmV4cG9ydCBlbnVtIFJlbmRlclRleHRNb2RlIHtcbiAgRElTQUJMRUQsXG4gIEVOQUJMRUQsXG4gIEVOSEFOQ0VEXG59XG5cbkBDb21wb25lbnQoe1xuICBzZWxlY3RvcjogJ3BkZi12aWV3ZXInLFxuICB0ZW1wbGF0ZTogYFxuICAgIDxkaXYgI3BkZlZpZXdlckNvbnRhaW5lciBjbGFzcz1cIm5nMi1wZGYtdmlld2VyLWNvbnRhaW5lclwiPlxuICAgICAgPGRpdiBjbGFzcz1cInBkZlZpZXdlclwiPjwvZGl2PlxuICAgIDwvZGl2PlxuICBgLFxuICBzdHlsZVVybHM6IFsnLi9wZGYtdmlld2VyLmNvbXBvbmVudC5zY3NzJ11cbn0pXG5leHBvcnQgY2xhc3MgUGRmVmlld2VyQ29tcG9uZW50XG4gIGltcGxlbWVudHMgT25DaGFuZ2VzLCBPbkluaXQsIE9uRGVzdHJveSwgQWZ0ZXJWaWV3Q2hlY2tlZCB7XG4gIHN0YXRpYyBDU1NfVU5JVFMgPSA5Ni4wIC8gNzIuMDtcbiAgc3RhdGljIEJPUkRFUl9XSURUSCA9IDk7XG5cbiAgQFZpZXdDaGlsZCgncGRmVmlld2VyQ29udGFpbmVyJykgcGRmVmlld2VyQ29udGFpbmVyITogRWxlbWVudFJlZjxIVE1MRGl2RWxlbWVudD47XG5cbiAgcHVibGljIGV2ZW50QnVzITogUERGSlNWaWV3ZXIuRXZlbnRCdXM7XG4gIHB1YmxpYyBwZGZMaW5rU2VydmljZSE6IFBERkpTVmlld2VyLlBERkxpbmtTZXJ2aWNlO1xuICBwdWJsaWMgcGRmRmluZENvbnRyb2xsZXIhOiBQREZKU1ZpZXdlci5QREZGaW5kQ29udHJvbGxlcjtcbiAgcHVibGljIHBkZlZpZXdlciE6IFBERkpTVmlld2VyLlBERlZpZXdlciB8IFBERkpTVmlld2VyLlBERlNpbmdsZVBhZ2VWaWV3ZXI7XG5cbiAgcHJpdmF0ZSBpc1Zpc2libGUgPSBmYWxzZTtcblxuICBwcml2YXRlIF9jTWFwc1VybCA9XG4gICAgdHlwZW9mIFBERkpTICE9PSAndW5kZWZpbmVkJ1xuICAgICAgPyBgaHR0cHM6Ly91bnBrZy5jb20vcGRmanMtZGlzdEAkeyhQREZKUyBhcyBhbnkpLnZlcnNpb259L2NtYXBzL2BcbiAgICAgIDogbnVsbDtcbiAgcHJpdmF0ZSBfaW1hZ2VSZXNvdXJjZXNQYXRoID1cbiAgICB0eXBlb2YgUERGSlMgIT09ICd1bmRlZmluZWQnXG4gICAgICA/IGBodHRwczovL3VucGtnLmNvbS9wZGZqcy1kaXN0QCR7KFBERkpTIGFzIGFueSkudmVyc2lvbn0vd2ViL2ltYWdlcy9gXG4gICAgICA6IHVuZGVmaW5lZDtcbiAgcHJpdmF0ZSBfcmVuZGVyVGV4dCA9IHRydWU7XG4gIHByaXZhdGUgX3JlbmRlclRleHRNb2RlOiBSZW5kZXJUZXh0TW9kZSA9IFJlbmRlclRleHRNb2RlLkVOQUJMRUQ7XG4gIHByaXZhdGUgX3N0aWNrVG9QYWdlID0gZmFsc2U7XG4gIHByaXZhdGUgX29yaWdpbmFsU2l6ZSA9IHRydWU7XG4gIHByaXZhdGUgX3BkZjogUERGRG9jdW1lbnRQcm94eSB8IHVuZGVmaW5lZDtcbiAgcHJpdmF0ZSBfcGFnZSA9IDE7XG4gIHByaXZhdGUgX3pvb20gPSAxO1xuICBwcml2YXRlIF96b29tU2NhbGU6IFpvb21TY2FsZSA9ICdwYWdlLXdpZHRoJztcbiAgcHJpdmF0ZSBfcm90YXRpb24gPSAwO1xuICBwcml2YXRlIF9zaG93QWxsID0gdHJ1ZTtcbiAgcHJpdmF0ZSBfY2FuQXV0b1Jlc2l6ZSA9IHRydWU7XG4gIHByaXZhdGUgX2ZpdFRvUGFnZSA9IGZhbHNlO1xuICBwcml2YXRlIF9leHRlcm5hbExpbmtUYXJnZXQgPSAnYmxhbmsnO1xuICBwcml2YXRlIF9zaG93Qm9yZGVycyA9IGZhbHNlO1xuICBwcml2YXRlIGxhc3RMb2FkZWQhOiBzdHJpbmcgfCBVaW50OEFycmF5IHwgUERGU291cmNlIHwgbnVsbDtcbiAgcHJpdmF0ZSBfbGF0ZXN0U2Nyb2xsZWRQYWdlITogbnVtYmVyO1xuXG4gIHByaXZhdGUgcGFnZVNjcm9sbFRpbWVvdXQ6IG51bWJlciB8IG51bGwgPSBudWxsO1xuICBwcml2YXRlIGlzSW5pdGlhbGl6ZWQgPSBmYWxzZTtcbiAgcHJpdmF0ZSBsb2FkaW5nVGFzaz86IFBERkRvY3VtZW50TG9hZGluZ1Rhc2sgfCBudWxsO1xuICBwcml2YXRlIGRlc3Ryb3kkID0gbmV3IFN1YmplY3Q8dm9pZD4oKTtcblxuICBAT3V0cHV0KCdhZnRlci1sb2FkLWNvbXBsZXRlJykgYWZ0ZXJMb2FkQ29tcGxldGUgPSBuZXcgRXZlbnRFbWl0dGVyPFBERkRvY3VtZW50UHJveHk+KCk7XG4gIEBPdXRwdXQoJ3BhZ2UtcmVuZGVyZWQnKSBwYWdlUmVuZGVyZWQgPSBuZXcgRXZlbnRFbWl0dGVyPEN1c3RvbUV2ZW50PigpO1xuICBAT3V0cHV0KCdwYWdlcy1pbml0aWFsaXplZCcpIHBhZ2VJbml0aWFsaXplZCA9IG5ldyBFdmVudEVtaXR0ZXI8Q3VzdG9tRXZlbnQ+KCk7XG4gIEBPdXRwdXQoJ3RleHQtbGF5ZXItcmVuZGVyZWQnKSB0ZXh0TGF5ZXJSZW5kZXJlZCA9IG5ldyBFdmVudEVtaXR0ZXI8Q3VzdG9tRXZlbnQ+KCk7XG4gIEBPdXRwdXQoJ2Vycm9yJykgb25FcnJvciA9IG5ldyBFdmVudEVtaXR0ZXI8YW55PigpO1xuICBAT3V0cHV0KCdvbi1wcm9ncmVzcycpIG9uUHJvZ3Jlc3MgPSBuZXcgRXZlbnRFbWl0dGVyPFBERlByb2dyZXNzRGF0YT4oKTtcbiAgQE91dHB1dCgpIHBhZ2VDaGFuZ2U6IEV2ZW50RW1pdHRlcjxudW1iZXI+ID0gbmV3IEV2ZW50RW1pdHRlcjxudW1iZXI+KHRydWUpO1xuICBASW5wdXQoKSBzcmM/OiBzdHJpbmcgfCBVaW50OEFycmF5IHwgUERGU291cmNlO1xuXG4gIEBJbnB1dCgnYy1tYXBzLXVybCcpXG4gIHNldCBjTWFwc1VybChjTWFwc1VybDogc3RyaW5nKSB7XG4gICAgdGhpcy5fY01hcHNVcmwgPSBjTWFwc1VybDtcbiAgfVxuXG4gIEBJbnB1dCgncGFnZScpXG4gIHNldCBwYWdlKF9wYWdlOiBudW1iZXIgfCBzdHJpbmcgfCBhbnkpIHtcbiAgICBfcGFnZSA9IHBhcnNlSW50KF9wYWdlLCAxMCkgfHwgMTtcbiAgICBjb25zdCBvcmlnaW5hbFBhZ2UgPSBfcGFnZTtcblxuICAgIGlmICh0aGlzLl9wZGYpIHtcbiAgICAgIF9wYWdlID0gdGhpcy5nZXRWYWxpZFBhZ2VOdW1iZXIoX3BhZ2UpO1xuICAgIH1cblxuICAgIHRoaXMuX3BhZ2UgPSBfcGFnZTtcbiAgICBpZiAob3JpZ2luYWxQYWdlICE9PSBfcGFnZSkge1xuICAgICAgdGhpcy5wYWdlQ2hhbmdlLmVtaXQoX3BhZ2UpO1xuICAgIH1cbiAgfVxuXG4gIEBJbnB1dCgncmVuZGVyLXRleHQnKVxuICBzZXQgcmVuZGVyVGV4dChyZW5kZXJUZXh0OiBib29sZWFuKSB7XG4gICAgdGhpcy5fcmVuZGVyVGV4dCA9IHJlbmRlclRleHQ7XG4gIH1cblxuICBASW5wdXQoJ3JlbmRlci10ZXh0LW1vZGUnKVxuICBzZXQgcmVuZGVyVGV4dE1vZGUocmVuZGVyVGV4dE1vZGU6IFJlbmRlclRleHRNb2RlKSB7XG4gICAgdGhpcy5fcmVuZGVyVGV4dE1vZGUgPSByZW5kZXJUZXh0TW9kZTtcbiAgfVxuXG4gIEBJbnB1dCgnb3JpZ2luYWwtc2l6ZScpXG4gIHNldCBvcmlnaW5hbFNpemUob3JpZ2luYWxTaXplOiBib29sZWFuKSB7XG4gICAgdGhpcy5fb3JpZ2luYWxTaXplID0gb3JpZ2luYWxTaXplO1xuICB9XG5cbiAgQElucHV0KCdzaG93LWFsbCcpXG4gIHNldCBzaG93QWxsKHZhbHVlOiBib29sZWFuKSB7XG4gICAgdGhpcy5fc2hvd0FsbCA9IHZhbHVlO1xuICB9XG5cbiAgQElucHV0KCdzdGljay10by1wYWdlJylcbiAgc2V0IHN0aWNrVG9QYWdlKHZhbHVlOiBib29sZWFuKSB7XG4gICAgdGhpcy5fc3RpY2tUb1BhZ2UgPSB2YWx1ZTtcbiAgfVxuXG4gIEBJbnB1dCgnem9vbScpXG4gIHNldCB6b29tKHZhbHVlOiBudW1iZXIpIHtcbiAgICBpZiAodmFsdWUgPD0gMCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRoaXMuX3pvb20gPSB2YWx1ZTtcbiAgfVxuXG4gIGdldCB6b29tKCkge1xuICAgIHJldHVybiB0aGlzLl96b29tO1xuICB9XG5cbiAgQElucHV0KCd6b29tLXNjYWxlJylcbiAgc2V0IHpvb21TY2FsZSh2YWx1ZTogWm9vbVNjYWxlKSB7XG4gICAgdGhpcy5fem9vbVNjYWxlID0gdmFsdWU7XG4gIH1cblxuICBnZXQgem9vbVNjYWxlKCkge1xuICAgIHJldHVybiB0aGlzLl96b29tU2NhbGU7XG4gIH1cblxuICBASW5wdXQoJ3JvdGF0aW9uJylcbiAgc2V0IHJvdGF0aW9uKHZhbHVlOiBudW1iZXIpIHtcbiAgICBpZiAoISh0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInICYmIHZhbHVlICUgOTAgPT09IDApKSB7XG4gICAgICBjb25zb2xlLndhcm4oJ0ludmFsaWQgcGFnZXMgcm90YXRpb24gYW5nbGUuJyk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5fcm90YXRpb24gPSB2YWx1ZTtcbiAgfVxuXG4gIEBJbnB1dCgnZXh0ZXJuYWwtbGluay10YXJnZXQnKVxuICBzZXQgZXh0ZXJuYWxMaW5rVGFyZ2V0KHZhbHVlOiBzdHJpbmcpIHtcbiAgICB0aGlzLl9leHRlcm5hbExpbmtUYXJnZXQgPSB2YWx1ZTtcbiAgfVxuXG4gIEBJbnB1dCgnYXV0b3Jlc2l6ZScpXG4gIHNldCBhdXRvcmVzaXplKHZhbHVlOiBib29sZWFuKSB7XG4gICAgdGhpcy5fY2FuQXV0b1Jlc2l6ZSA9IEJvb2xlYW4odmFsdWUpO1xuICB9XG5cbiAgQElucHV0KCdmaXQtdG8tcGFnZScpXG4gIHNldCBmaXRUb1BhZ2UodmFsdWU6IGJvb2xlYW4pIHtcbiAgICB0aGlzLl9maXRUb1BhZ2UgPSBCb29sZWFuKHZhbHVlKTtcbiAgfVxuXG4gIEBJbnB1dCgnc2hvdy1ib3JkZXJzJylcbiAgc2V0IHNob3dCb3JkZXJzKHZhbHVlOiBib29sZWFuKSB7XG4gICAgdGhpcy5fc2hvd0JvcmRlcnMgPSBCb29sZWFuKHZhbHVlKTtcbiAgfVxuXG4gIHN0YXRpYyBnZXRMaW5rVGFyZ2V0KHR5cGU6IHN0cmluZykge1xuICAgIHN3aXRjaCAodHlwZSkge1xuICAgICAgY2FzZSAnYmxhbmsnOlxuICAgICAgICByZXR1cm4gKFBERkpTVmlld2VyIGFzIGFueSkuTGlua1RhcmdldC5CTEFOSztcbiAgICAgIGNhc2UgJ25vbmUnOlxuICAgICAgICByZXR1cm4gKFBERkpTVmlld2VyIGFzIGFueSkuTGlua1RhcmdldC5OT05FO1xuICAgICAgY2FzZSAnc2VsZic6XG4gICAgICAgIHJldHVybiAoUERGSlNWaWV3ZXIgYXMgYW55KS5MaW5rVGFyZ2V0LlNFTEY7XG4gICAgICBjYXNlICdwYXJlbnQnOlxuICAgICAgICByZXR1cm4gKFBERkpTVmlld2VyIGFzIGFueSkuTGlua1RhcmdldC5QQVJFTlQ7XG4gICAgICBjYXNlICd0b3AnOlxuICAgICAgICByZXR1cm4gKFBERkpTVmlld2VyIGFzIGFueSkuTGlua1RhcmdldC5UT1A7XG4gICAgfVxuXG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICBjb25zdHJ1Y3Rvcihwcml2YXRlIGVsZW1lbnQ6IEVsZW1lbnRSZWY8SFRNTEVsZW1lbnQ+LCBwcml2YXRlIG5nWm9uZTogTmdab25lKSB7XG4gICAgaWYgKGlzU1NSKCkpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBsZXQgcGRmV29ya2VyU3JjOiBzdHJpbmc7XG5cbiAgICBjb25zdCBwZGZKc1ZlcnNpb246IHN0cmluZyA9IChQREZKUyBhcyBhbnkpLnZlcnNpb247XG4gICAgY29uc3QgdmVyc2lvblNwZWNpZmljUGRmV29ya2VyVXJsOiBzdHJpbmcgPSAod2luZG93IGFzIGFueSlbYHBkZldvcmtlclNyYyR7cGRmSnNWZXJzaW9ufWBdO1xuXG4gICAgaWYgKHZlcnNpb25TcGVjaWZpY1BkZldvcmtlclVybCkge1xuICAgICAgcGRmV29ya2VyU3JjID0gdmVyc2lvblNwZWNpZmljUGRmV29ya2VyVXJsO1xuICAgIH0gZWxzZSBpZiAoXG4gICAgICB3aW5kb3cuaGFzT3duUHJvcGVydHkoJ3BkZldvcmtlclNyYycpICYmXG4gICAgICB0eXBlb2YgKHdpbmRvdyBhcyBhbnkpLnBkZldvcmtlclNyYyA9PT0gJ3N0cmluZycgJiZcbiAgICAgICh3aW5kb3cgYXMgYW55KS5wZGZXb3JrZXJTcmNcbiAgICApIHtcbiAgICAgIHBkZldvcmtlclNyYyA9ICh3aW5kb3cgYXMgYW55KS5wZGZXb3JrZXJTcmM7XG4gICAgfSBlbHNlIHtcbiAgICAgIHBkZldvcmtlclNyYyA9IGBodHRwczovL2Nkbi5qc2RlbGl2ci5uZXQvbnBtL3BkZmpzLWRpc3RAJHtwZGZKc1ZlcnNpb25cbiAgICAgICAgfS9sZWdhY3kvYnVpbGQvcGRmLndvcmtlci5taW4ubWpzYDtcbiAgICB9XG5cbiAgICBhc3NpZ24oR2xvYmFsV29ya2VyT3B0aW9ucywgJ3dvcmtlclNyYycsIHBkZldvcmtlclNyYyk7XG4gIH1cblxuICBuZ0FmdGVyVmlld0NoZWNrZWQoKTogdm9pZCB7XG4gICAgaWYgKHRoaXMuaXNJbml0aWFsaXplZCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IG9mZnNldCA9IHRoaXMucGRmVmlld2VyQ29udGFpbmVyLm5hdGl2ZUVsZW1lbnQub2Zmc2V0UGFyZW50O1xuXG4gICAgaWYgKHRoaXMuaXNWaXNpYmxlID09PSB0cnVlICYmIG9mZnNldCA9PSBudWxsKSB7XG4gICAgICB0aGlzLmlzVmlzaWJsZSA9IGZhbHNlO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmICh0aGlzLmlzVmlzaWJsZSA9PT0gZmFsc2UgJiYgb2Zmc2V0ICE9IG51bGwpIHtcbiAgICAgIHRoaXMuaXNWaXNpYmxlID0gdHJ1ZTtcblxuICAgICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgIHRoaXMuaW5pdGlhbGl6ZSgpO1xuICAgICAgICB0aGlzLm5nT25DaGFuZ2VzKHsgc3JjOiB0aGlzLnNyYyB9IGFzIGFueSk7XG4gICAgICB9KTtcbiAgICB9XG4gIH1cblxuICBuZ09uSW5pdCgpIHtcbiAgICB0aGlzLmluaXRpYWxpemUoKTtcbiAgICB0aGlzLnNldHVwUmVzaXplTGlzdGVuZXIoKTtcbiAgfVxuXG4gIG5nT25EZXN0cm95KCkge1xuICAgIHRoaXMuY2xlYXIoKTtcbiAgICB0aGlzLmRlc3Ryb3kkLm5leHQoKTtcbiAgICB0aGlzLmxvYWRpbmdUYXNrID0gbnVsbDtcbiAgfVxuXG4gIG5nT25DaGFuZ2VzKGNoYW5nZXM6IFNpbXBsZUNoYW5nZXMpIHtcbiAgICBpZiAoaXNTU1IoKSB8fCAhdGhpcy5pc1Zpc2libGUpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAoJ3NyYycgaW4gY2hhbmdlcykge1xuICAgICAgdGhpcy5sb2FkUERGKCk7XG4gICAgfSBlbHNlIGlmICh0aGlzLl9wZGYpIHtcbiAgICAgIGlmICgncmVuZGVyVGV4dCcgaW4gY2hhbmdlcyB8fCAnc2hvd0FsbCcgaW4gY2hhbmdlcykge1xuICAgICAgICB0aGlzLnNldHVwVmlld2VyKCk7XG4gICAgICAgIHRoaXMucmVzZXRQZGZEb2N1bWVudCgpO1xuICAgICAgfVxuICAgICAgaWYgKCdwYWdlJyBpbiBjaGFuZ2VzKSB7XG4gICAgICAgIGNvbnN0IHsgcGFnZSB9ID0gY2hhbmdlcztcbiAgICAgICAgaWYgKHBhZ2UuY3VycmVudFZhbHVlID09PSB0aGlzLl9sYXRlc3RTY3JvbGxlZFBhZ2UpIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyBOZXcgZm9ybSBvZiBwYWdlIGNoYW5naW5nOiBUaGUgdmlld2VyIHdpbGwgbm93IGp1bXAgdG8gdGhlIHNwZWNpZmllZCBwYWdlIHdoZW4gaXQgaXMgY2hhbmdlZC5cbiAgICAgICAgLy8gVGhpcyBiZWhhdmlvciBpcyBpbnRyb2R1Y2VkIGJ5IHVzaW5nIHRoZSBQREZTaW5nbGVQYWdlVmlld2VyXG4gICAgICAgIHRoaXMucGRmVmlld2VyLnNjcm9sbFBhZ2VJbnRvVmlldyh7IHBhZ2VOdW1iZXI6IHRoaXMuX3BhZ2UgfSk7XG4gICAgICB9XG5cbiAgICAgIHRoaXMudXBkYXRlKCk7XG4gICAgfVxuICB9XG5cbiAgcHVibGljIHVwZGF0ZVNpemUoKSB7XG4gICAgZnJvbShcbiAgICAgIHRoaXMuX3BkZiEuZ2V0UGFnZShcbiAgICAgICAgdGhpcy5wZGZWaWV3ZXIuY3VycmVudFBhZ2VOdW1iZXJcbiAgICAgIClcbiAgICApXG4gICAgICAucGlwZSh0YWtlVW50aWwodGhpcy5kZXN0cm95JCkpXG4gICAgICAuc3Vic2NyaWJlKHtcbiAgICAgICAgbmV4dDogKHBhZ2U6IFBERlBhZ2VQcm94eSkgPT4ge1xuICAgICAgICAgIGNvbnN0IHJvdGF0aW9uID0gdGhpcy5fcm90YXRpb24gKyBwYWdlLnJvdGF0ZTtcbiAgICAgICAgICBjb25zdCB2aWV3cG9ydFdpZHRoID1cbiAgICAgICAgICAgIHBhZ2UuZ2V0Vmlld3BvcnQoe1xuICAgICAgICAgICAgICBzY2FsZTogdGhpcy5fem9vbSxcbiAgICAgICAgICAgICAgcm90YXRpb25cbiAgICAgICAgICAgIH0pLndpZHRoICogUGRmVmlld2VyQ29tcG9uZW50LkNTU19VTklUUztcbiAgICAgICAgICBsZXQgc2NhbGUgPSB0aGlzLl96b29tO1xuICAgICAgICAgIGxldCBzdGlja1RvUGFnZSA9IHRydWU7XG5cbiAgICAgICAgICAvLyBTY2FsZSB0aGUgZG9jdW1lbnQgd2hlbiBpdCBzaG91bGRuJ3QgYmUgaW4gb3JpZ2luYWwgc2l6ZSBvciBkb2Vzbid0IGZpdCBpbnRvIHRoZSB2aWV3cG9ydFxuICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICF0aGlzLl9vcmlnaW5hbFNpemUgfHxcbiAgICAgICAgICAgICh0aGlzLl9maXRUb1BhZ2UgJiZcbiAgICAgICAgICAgICAgdmlld3BvcnRXaWR0aCA+IHRoaXMucGRmVmlld2VyQ29udGFpbmVyLm5hdGl2ZUVsZW1lbnQuY2xpZW50V2lkdGgpXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICBjb25zdCB2aWV3UG9ydCA9IHBhZ2UuZ2V0Vmlld3BvcnQoeyBzY2FsZTogMSwgcm90YXRpb24gfSk7XG4gICAgICAgICAgICBzY2FsZSA9IHRoaXMuZ2V0U2NhbGUodmlld1BvcnQud2lkdGgsIHZpZXdQb3J0LmhlaWdodCk7XG4gICAgICAgICAgICBzdGlja1RvUGFnZSA9ICF0aGlzLl9zdGlja1RvUGFnZTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvLyBkZWxheSB0byBlbnN1cmUgdGhhdCBwYWdlcyBhcmUgcmVhZHlcbiAgICAgICAgICB0aGlzLnBkZlZpZXdlci5wYWdlc1Byb21pc2U/LnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgdGhpcy5wZGZWaWV3ZXIuY3VycmVudFNjYWxlID0gc2NhbGU7XG4gICAgICAgICAgICBpZiAoc3RpY2tUb1BhZ2UpXG4gICAgICAgICAgICAgIHRoaXMucGRmVmlld2VyLnNjcm9sbFBhZ2VJbnRvVmlldyh7IHBhZ2VOdW1iZXI6IHBhZ2UucGFnZU51bWJlciwgaWdub3JlRGVzdGluYXRpb25ab29tOiB0cnVlIH0pXG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICB9XG5cbiAgcHVibGljIGNsZWFyKCkge1xuICAgIGlmICh0aGlzLmxvYWRpbmdUYXNrICYmICF0aGlzLmxvYWRpbmdUYXNrLmRlc3Ryb3llZCkge1xuICAgICAgdGhpcy5sb2FkaW5nVGFzay5kZXN0cm95KCk7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuX3BkZikge1xuICAgICAgdGhpcy5fbGF0ZXN0U2Nyb2xsZWRQYWdlID0gMDtcbiAgICAgIHRoaXMuX3BkZi5kZXN0cm95KCk7XG4gICAgICB0aGlzLl9wZGYgPSB1bmRlZmluZWQ7XG4gICAgfVxuXG4gICAgdGhpcy5wZGZWaWV3ZXIgJiYgdGhpcy5wZGZWaWV3ZXIuc2V0RG9jdW1lbnQobnVsbCBhcyBhbnkpO1xuICAgIHRoaXMucGRmTGlua1NlcnZpY2UgJiYgdGhpcy5wZGZMaW5rU2VydmljZS5zZXREb2N1bWVudChudWxsLCBudWxsKTtcbiAgICB0aGlzLnBkZkZpbmRDb250cm9sbGVyICYmIHRoaXMucGRmRmluZENvbnRyb2xsZXIuc2V0RG9jdW1lbnQobnVsbCBhcyBhbnkpO1xuICB9XG5cbiAgcHJpdmF0ZSBnZXRQREZMaW5rU2VydmljZUNvbmZpZygpIHtcbiAgICBjb25zdCBsaW5rVGFyZ2V0ID0gUGRmVmlld2VyQ29tcG9uZW50LmdldExpbmtUYXJnZXQodGhpcy5fZXh0ZXJuYWxMaW5rVGFyZ2V0KTtcblxuICAgIGlmIChsaW5rVGFyZ2V0KSB7XG4gICAgICByZXR1cm4geyBleHRlcm5hbExpbmtUYXJnZXQ6IGxpbmtUYXJnZXQgfTtcbiAgICB9XG5cbiAgICByZXR1cm4ge307XG4gIH1cblxuICBwcml2YXRlIGluaXRFdmVudEJ1cygpIHtcbiAgICB0aGlzLmV2ZW50QnVzID0gY3JlYXRlRXZlbnRCdXMoUERGSlNWaWV3ZXIsIHRoaXMuZGVzdHJveSQpO1xuXG4gICAgZnJvbUV2ZW50PEN1c3RvbUV2ZW50Pih0aGlzLmV2ZW50QnVzLCAncGFnZXJlbmRlcmVkJylcbiAgICAgIC5waXBlKHRha2VVbnRpbCh0aGlzLmRlc3Ryb3kkKSlcbiAgICAgIC5zdWJzY3JpYmUoKGV2ZW50KSA9PiB7XG4gICAgICAgIHRoaXMucGFnZVJlbmRlcmVkLmVtaXQoZXZlbnQpO1xuICAgICAgfSk7XG5cbiAgICBmcm9tRXZlbnQ8Q3VzdG9tRXZlbnQ+KHRoaXMuZXZlbnRCdXMsICdwYWdlc2luaXQnKVxuICAgICAgLnBpcGUodGFrZVVudGlsKHRoaXMuZGVzdHJveSQpKVxuICAgICAgLnN1YnNjcmliZSgoZXZlbnQpID0+IHtcbiAgICAgICAgdGhpcy5wYWdlSW5pdGlhbGl6ZWQuZW1pdChldmVudCk7XG4gICAgICB9KTtcblxuICAgIGZyb21FdmVudCh0aGlzLmV2ZW50QnVzLCAncGFnZWNoYW5naW5nJylcbiAgICAgIC5waXBlKHRha2VVbnRpbCh0aGlzLmRlc3Ryb3kkKSlcbiAgICAgIC5zdWJzY3JpYmUoKHsgcGFnZU51bWJlciB9OiBhbnkpID0+IHtcbiAgICAgICAgaWYgKHRoaXMucGFnZVNjcm9sbFRpbWVvdXQpIHtcbiAgICAgICAgICBjbGVhclRpbWVvdXQodGhpcy5wYWdlU2Nyb2xsVGltZW91dCk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnBhZ2VTY3JvbGxUaW1lb3V0ID0gd2luZG93LnNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgIHRoaXMuX2xhdGVzdFNjcm9sbGVkUGFnZSA9IHBhZ2VOdW1iZXI7XG4gICAgICAgICAgdGhpcy5wYWdlQ2hhbmdlLmVtaXQocGFnZU51bWJlcik7XG4gICAgICAgIH0sIDEwMCk7XG4gICAgICB9KTtcblxuICAgIGZyb21FdmVudDxDdXN0b21FdmVudD4odGhpcy5ldmVudEJ1cywgJ3RleHRsYXllcnJlbmRlcmVkJylcbiAgICAgIC5waXBlKHRha2VVbnRpbCh0aGlzLmRlc3Ryb3kkKSlcbiAgICAgIC5zdWJzY3JpYmUoKGV2ZW50KSA9PiB7XG4gICAgICAgIHRoaXMudGV4dExheWVyUmVuZGVyZWQuZW1pdChldmVudCk7XG4gICAgICB9KTtcbiAgfVxuXG4gIHByaXZhdGUgaW5pdFBERlNlcnZpY2VzKCkge1xuICAgIHRoaXMucGRmTGlua1NlcnZpY2UgPSBuZXcgUERGSlNWaWV3ZXIuUERGTGlua1NlcnZpY2Uoe1xuICAgICAgZXZlbnRCdXM6IHRoaXMuZXZlbnRCdXMsXG4gICAgICAuLi50aGlzLmdldFBERkxpbmtTZXJ2aWNlQ29uZmlnKClcbiAgICB9KTtcbiAgICB0aGlzLnBkZkZpbmRDb250cm9sbGVyID0gbmV3IFBERkpTVmlld2VyLlBERkZpbmRDb250cm9sbGVyKHtcbiAgICAgIGV2ZW50QnVzOiB0aGlzLmV2ZW50QnVzLFxuICAgICAgbGlua1NlcnZpY2U6IHRoaXMucGRmTGlua1NlcnZpY2UsXG4gICAgfSk7XG4gIH1cblxuICBwcml2YXRlIGdldFBERk9wdGlvbnMoKTogUERGVmlld2VyT3B0aW9ucyB7XG4gICAgcmV0dXJuIHtcbiAgICAgIGV2ZW50QnVzOiB0aGlzLmV2ZW50QnVzLFxuICAgICAgY29udGFpbmVyOiB0aGlzLmVsZW1lbnQubmF0aXZlRWxlbWVudC5xdWVyeVNlbGVjdG9yKCdkaXYnKSEsXG4gICAgICByZW1vdmVQYWdlQm9yZGVyczogIXRoaXMuX3Nob3dCb3JkZXJzLFxuICAgICAgbGlua1NlcnZpY2U6IHRoaXMucGRmTGlua1NlcnZpY2UsXG4gICAgICB0ZXh0TGF5ZXJNb2RlOiB0aGlzLl9yZW5kZXJUZXh0XG4gICAgICAgID8gdGhpcy5fcmVuZGVyVGV4dE1vZGVcbiAgICAgICAgOiBSZW5kZXJUZXh0TW9kZS5ESVNBQkxFRCxcbiAgICAgIGZpbmRDb250cm9sbGVyOiB0aGlzLnBkZkZpbmRDb250cm9sbGVyLFxuICAgICAgbDEwbjogbmV3IFBERkpTVmlld2VyLkdlbmVyaWNMMTBuKCdlbicpLFxuICAgICAgaW1hZ2VSZXNvdXJjZXNQYXRoOiB0aGlzLl9pbWFnZVJlc291cmNlc1BhdGgsXG4gICAgICBhbm5vdGF0aW9uRWRpdG9yTW9kZTogUERGSlMuQW5ub3RhdGlvbkVkaXRvclR5cGUuRElTQUJMRSxcbiAgICB9O1xuICB9XG5cbiAgcHJpdmF0ZSBzZXR1cFZpZXdlcigpIHtcbiAgICBpZiAodGhpcy5wZGZWaWV3ZXIpIHtcbiAgICAgIHRoaXMucGRmVmlld2VyLnNldERvY3VtZW50KG51bGwgYXMgYW55KTtcbiAgICB9XG5cbiAgICBhc3NpZ24oUERGSlMsICdkaXNhYmxlVGV4dExheWVyJywgIXRoaXMuX3JlbmRlclRleHQpO1xuXG4gICAgdGhpcy5pbml0UERGU2VydmljZXMoKTtcblxuICAgIGlmICh0aGlzLl9zaG93QWxsKSB7XG4gICAgICB0aGlzLnBkZlZpZXdlciA9IG5ldyBQREZKU1ZpZXdlci5QREZWaWV3ZXIodGhpcy5nZXRQREZPcHRpb25zKCkpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLnBkZlZpZXdlciA9IG5ldyBQREZKU1ZpZXdlci5QREZTaW5nbGVQYWdlVmlld2VyKHRoaXMuZ2V0UERGT3B0aW9ucygpKTtcbiAgICB9XG4gICAgdGhpcy5wZGZMaW5rU2VydmljZS5zZXRWaWV3ZXIodGhpcy5wZGZWaWV3ZXIpO1xuXG4gICAgdGhpcy5wZGZWaWV3ZXIuX2N1cnJlbnRQYWdlTnVtYmVyID0gdGhpcy5fcGFnZTtcbiAgfVxuXG4gIHByaXZhdGUgZ2V0VmFsaWRQYWdlTnVtYmVyKHBhZ2U6IG51bWJlcik6IG51bWJlciB7XG4gICAgaWYgKHBhZ2UgPCAxKSB7XG4gICAgICByZXR1cm4gMTtcbiAgICB9XG5cbiAgICBpZiAocGFnZSA+IHRoaXMuX3BkZiEubnVtUGFnZXMpIHtcbiAgICAgIHJldHVybiB0aGlzLl9wZGYhLm51bVBhZ2VzO1xuICAgIH1cblxuICAgIHJldHVybiBwYWdlO1xuICB9XG5cbiAgcHJpdmF0ZSBnZXREb2N1bWVudFBhcmFtcygpIHtcbiAgICBjb25zdCBzcmNUeXBlID0gdHlwZW9mIHRoaXMuc3JjO1xuXG4gICAgaWYgKCF0aGlzLl9jTWFwc1VybCkge1xuICAgICAgcmV0dXJuIHRoaXMuc3JjO1xuICAgIH1cblxuICAgIGNvbnN0IHBhcmFtczogYW55ID0ge1xuICAgICAgY01hcFVybDogdGhpcy5fY01hcHNVcmwsXG4gICAgICBjTWFwUGFja2VkOiB0cnVlLFxuICAgICAgZW5hYmxlWGZhOiB0cnVlLFxuICAgIH07XG4gICAgcGFyYW1zLmlzRXZhbFN1cHBvcnRlZCA9IGZhbHNlOyAvLyBodHRwOi8vY3ZlLm9yZy9DVkVSZWNvcmQ/aWQ9Q1ZFLTIwMjQtNDM2N1xuXG4gICAgaWYgKHNyY1R5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgICBwYXJhbXMudXJsID0gdGhpcy5zcmM7XG4gICAgfSBlbHNlIGlmIChzcmNUeXBlID09PSAnb2JqZWN0Jykge1xuICAgICAgaWYgKCh0aGlzLnNyYyBhcyBhbnkpLmJ5dGVMZW5ndGggIT09IHVuZGVmaW5lZCkge1xuICAgICAgICBwYXJhbXMuZGF0YSA9IHRoaXMuc3JjO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgT2JqZWN0LmFzc2lnbihwYXJhbXMsIHRoaXMuc3JjKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gcGFyYW1zO1xuICB9XG5cbiAgcHJpdmF0ZSBsb2FkUERGKCkge1xuICAgIGlmICghdGhpcy5zcmMpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5sYXN0TG9hZGVkID09PSB0aGlzLnNyYykge1xuICAgICAgdGhpcy51cGRhdGUoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0aGlzLmNsZWFyKCk7XG5cbiAgICB0aGlzLnNldHVwVmlld2VyKCk7XG5cbiAgICB0aGlzLmxvYWRpbmdUYXNrID0gZ2V0RG9jdW1lbnQodGhpcy5nZXREb2N1bWVudFBhcmFtcygpKTtcblxuICAgIHRoaXMubG9hZGluZ1Rhc2shLm9uUHJvZ3Jlc3MgPSAocHJvZ3Jlc3NEYXRhOiBQREZQcm9ncmVzc0RhdGEpID0+IHtcbiAgICAgIHRoaXMub25Qcm9ncmVzcy5lbWl0KHByb2dyZXNzRGF0YSk7XG4gICAgfTtcblxuICAgIGNvbnN0IHNyYyA9IHRoaXMuc3JjO1xuXG4gICAgZnJvbSh0aGlzLmxvYWRpbmdUYXNrIS5wcm9taXNlIGFzIFByb21pc2U8UERGRG9jdW1lbnRQcm94eT4pXG4gICAgICAucGlwZSh0YWtlVW50aWwodGhpcy5kZXN0cm95JCkpXG4gICAgICAuc3Vic2NyaWJlKHtcbiAgICAgICAgbmV4dDogKHBkZikgPT4ge1xuICAgICAgICAgIHRoaXMuX3BkZiA9IHBkZjtcbiAgICAgICAgICB0aGlzLmxhc3RMb2FkZWQgPSBzcmM7XG5cbiAgICAgICAgICB0aGlzLmFmdGVyTG9hZENvbXBsZXRlLmVtaXQocGRmKTtcbiAgICAgICAgICB0aGlzLnJlc2V0UGRmRG9jdW1lbnQoKTtcblxuICAgICAgICAgIHRoaXMudXBkYXRlKCk7XG4gICAgICAgIH0sXG4gICAgICAgIGVycm9yOiAoZXJyb3IpID0+IHtcbiAgICAgICAgICB0aGlzLmxhc3RMb2FkZWQgPSBudWxsO1xuICAgICAgICAgIHRoaXMub25FcnJvci5lbWl0KGVycm9yKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gIH1cblxuICBwcml2YXRlIHVwZGF0ZSgpIHtcbiAgICB0aGlzLnBhZ2UgPSB0aGlzLl9wYWdlO1xuXG4gICAgdGhpcy5yZW5kZXIoKTtcbiAgfVxuXG4gIHByaXZhdGUgcmVuZGVyKCkge1xuICAgIHRoaXMuX3BhZ2UgPSB0aGlzLmdldFZhbGlkUGFnZU51bWJlcih0aGlzLl9wYWdlKTtcblxuICAgIGlmIChcbiAgICAgIHRoaXMuX3JvdGF0aW9uICE9PSAwIHx8XG4gICAgICB0aGlzLnBkZlZpZXdlci5wYWdlc1JvdGF0aW9uICE9PSB0aGlzLl9yb3RhdGlvblxuICAgICkge1xuICAgICAgLy8gd2FpdCB1bnRpbCBhdCBsZWFzdCB0aGUgZmlyc3QgcGFnZSBpcyBhdmFpbGFibGUuXG4gICAgICB0aGlzLnBkZlZpZXdlci5maXJzdFBhZ2VQcm9taXNlPy50aGVuKFxuICAgICAgICAoKSA9PiAodGhpcy5wZGZWaWV3ZXIucGFnZXNSb3RhdGlvbiA9IHRoaXMuX3JvdGF0aW9uKVxuICAgICAgKTtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5fc3RpY2tUb1BhZ2UpIHtcbiAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICB0aGlzLnBkZlZpZXdlci5jdXJyZW50UGFnZU51bWJlciA9IHRoaXMuX3BhZ2U7XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICB0aGlzLnVwZGF0ZVNpemUoKTtcbiAgfVxuXG4gIHByaXZhdGUgZ2V0U2NhbGUodmlld3BvcnRXaWR0aDogbnVtYmVyLCB2aWV3cG9ydEhlaWdodDogbnVtYmVyKSB7XG4gICAgY29uc3QgYm9yZGVyU2l6ZSA9IHRoaXMuX3Nob3dCb3JkZXJzID8gMiAqIFBkZlZpZXdlckNvbXBvbmVudC5CT1JERVJfV0lEVEggOiAwO1xuICAgIGNvbnN0IHBkZkNvbnRhaW5lcldpZHRoID0gdGhpcy5wZGZWaWV3ZXJDb250YWluZXIubmF0aXZlRWxlbWVudC5jbGllbnRXaWR0aCAtIGJvcmRlclNpemU7XG4gICAgY29uc3QgcGRmQ29udGFpbmVySGVpZ2h0ID0gdGhpcy5wZGZWaWV3ZXJDb250YWluZXIubmF0aXZlRWxlbWVudC5jbGllbnRIZWlnaHQgLSBib3JkZXJTaXplO1xuXG4gICAgaWYgKFxuICAgICAgcGRmQ29udGFpbmVySGVpZ2h0ID09PSAwIHx8XG4gICAgICB2aWV3cG9ydEhlaWdodCA9PT0gMCB8fFxuICAgICAgcGRmQ29udGFpbmVyV2lkdGggPT09IDAgfHxcbiAgICAgIHZpZXdwb3J0V2lkdGggPT09IDBcbiAgICApIHtcbiAgICAgIHJldHVybiAxO1xuICAgIH1cblxuICAgIGxldCByYXRpbyA9IDE7XG4gICAgc3dpdGNoICh0aGlzLl96b29tU2NhbGUpIHtcbiAgICAgIGNhc2UgJ3BhZ2UtZml0JzpcbiAgICAgICAgcmF0aW8gPSBNYXRoLm1pbihcbiAgICAgICAgICBwZGZDb250YWluZXJIZWlnaHQgLyB2aWV3cG9ydEhlaWdodCxcbiAgICAgICAgICBwZGZDb250YWluZXJXaWR0aCAvIHZpZXdwb3J0V2lkdGhcbiAgICAgICAgKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdwYWdlLWhlaWdodCc6XG4gICAgICAgIHJhdGlvID0gcGRmQ29udGFpbmVySGVpZ2h0IC8gdmlld3BvcnRIZWlnaHQ7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAncGFnZS13aWR0aCc6XG4gICAgICBkZWZhdWx0OlxuICAgICAgICByYXRpbyA9IHBkZkNvbnRhaW5lcldpZHRoIC8gdmlld3BvcnRXaWR0aDtcbiAgICAgICAgYnJlYWs7XG4gICAgfVxuXG4gICAgcmV0dXJuICh0aGlzLl96b29tICogcmF0aW8pIC8gUGRmVmlld2VyQ29tcG9uZW50LkNTU19VTklUUztcbiAgfVxuXG4gIHByaXZhdGUgcmVzZXRQZGZEb2N1bWVudCgpIHtcbiAgICB0aGlzLnBkZkxpbmtTZXJ2aWNlLnNldERvY3VtZW50KHRoaXMuX3BkZiwgbnVsbCk7XG4gICAgdGhpcy5wZGZGaW5kQ29udHJvbGxlci5zZXREb2N1bWVudCh0aGlzLl9wZGYhKTtcbiAgICB0aGlzLnBkZlZpZXdlci5zZXREb2N1bWVudCh0aGlzLl9wZGYhKTtcbiAgfVxuXG4gIHByaXZhdGUgaW5pdGlhbGl6ZSgpOiB2b2lkIHtcbiAgICBpZiAoaXNTU1IoKSB8fCAhdGhpcy5pc1Zpc2libGUpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0aGlzLmlzSW5pdGlhbGl6ZWQgPSB0cnVlO1xuICAgIHRoaXMuaW5pdEV2ZW50QnVzKCk7XG4gICAgdGhpcy5zZXR1cFZpZXdlcigpO1xuICB9XG5cbiAgcHJpdmF0ZSBzZXR1cFJlc2l6ZUxpc3RlbmVyKCk6IHZvaWQge1xuICAgIGlmIChpc1NTUigpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5uZ1pvbmUucnVuT3V0c2lkZUFuZ3VsYXIoKCkgPT4ge1xuICAgICAgZnJvbUV2ZW50KHdpbmRvdywgJ3Jlc2l6ZScpXG4gICAgICAgIC5waXBlKFxuICAgICAgICAgIGRlYm91bmNlVGltZSgxMDApLFxuICAgICAgICAgIGZpbHRlcigoKSA9PiB0aGlzLl9jYW5BdXRvUmVzaXplICYmICEhdGhpcy5fcGRmKSxcbiAgICAgICAgICB0YWtlVW50aWwodGhpcy5kZXN0cm95JClcbiAgICAgICAgKVxuICAgICAgICAuc3Vic2NyaWJlKCgpID0+IHtcbiAgICAgICAgICB0aGlzLnVwZGF0ZVNpemUoKTtcbiAgICAgICAgfSk7XG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==