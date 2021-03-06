// esri.core.Accessor
import Accessor = require("esri/core/Accessor");

// esri.core.accessorSupport
import {
  property,
  subclass
} from "esri/core/accessorSupport/decorators";

// esri.core.Handles
import Handles = require("esri/core/Handles");

// esri.core.watchUtils
import watchUtils = require("esri/core/watchUtils");

// esri.views.MapView
import MapView = require("esri/views/MapView");

// esri.views.layers.FeatureLayerView
import FeatureLayerView = require("esri/views/layers/FeatureLayerView");

// esri.core.Collection
import Collection = require("esri/core/Collection");

// esri.widgets.Legend.support.ActiveLayerInfo
import ActiveLayerInfo = require("esri/widgets/Legend/support/ActiveLayerInfo");

// esri.widgets.LayerList.LayerListViewModel
import LayerListViewModel = require("esri/widgets/LayerList/LayerListViewModel");

// esri.views.layers.support.FeatureFilter
import FeatureFilter = require("esri/views/layers/support/FeatureFilter");

// esri.views.layers.support.FeatureEffect
import FeatureEffect = require("esri/views/layers/support/FeatureEffect");

// esri.tasks.support.Query
import Query = require("esri/tasks/support/Query");

// InteractiveStyleData
import InteractiveStyleData = require("./InteractiveStyleData");

// interfaces
import {
  FilterMode,
  LegendElement
} from "../../../../../interfaces/interfaces";
import SelectedStyleData = require("./SelectedStyleData");

// State
type State = "ready" | "loading" | "disabled" | "querying";

@subclass("InteractiveStyleViewModel")
class InteractiveStyleViewModel extends Accessor {
  //----------------------------------
  //
  //  Variables
  //
  //----------------------------------
  private _handles = new Handles();

  //----------------------------------
  //
  //  Properties
  //
  //----------------------------------

  // view
  @property()
  view: MapView = null;

  // activeLayerInfos
  @property()
  activeLayerInfos: Collection<ActiveLayerInfo> = null;

  // interactiveStyleData
  @property()
  interactiveStyleData: InteractiveStyleData = new InteractiveStyleData();

  // featureLayerViews
  @property()
  featureLayerViews: Collection<FeatureLayerView> = new Collection();

  @property()
  featureCountQuery = null;

  // state
  @property({
    dependsOn: [
      "view.updating",
      "searchExpressions",
      "layerListViewModel",
      "featureCountQuery"
    ],
    readOnly: true
  })
  get state(): State {
    return this.view
      ? this.get("view.ready")
        ? this.featureCountQuery
          ? "querying"
          : "ready"
        : "loading"
      : "disabled";
  }

  // selectedStyleDataCollection
  @property()
  selectedStyleDataCollection: Collection<SelectedStyleData> = new Collection();

  // filterMode
  @property()
  filterMode: FilterMode = null;

  // layerListViewModel
  @property()
  layerListViewModel: LayerListViewModel = new LayerListViewModel();

  // searchExpressions
  @property()
  searchExpressions: Collection<string> = new Collection();

  // searchViewModel
  @property()
  searchViewModel: __esri.SearchViewModel = null;

  // opacity
  @property()
  opacity: number = null;

  // grayScale
  @property()
  grayScale: number = null;

  // featureCountEnabled
  @property()
  featureCountEnabled: boolean = null;

  // updateExtentEnabled
  @property()
  updateExtentEnabled: boolean = null;

  //----------------------------------
  //
  //  Lifecycle methods
  //
  //----------------------------------

  initialize() {
    const disableClusteringKey = "disable-clustering";
    this._handles.add(
      watchUtils.when(this, "view.map.allLayers", () => {
        this._disableClustering(disableClusteringKey);
      }),
      disableClusteringKey
    );

    this._handles.add([
      watchUtils.init(this, "view", () => {
        if (!this.view) {
          return;
        }

        this._handles.add([
          watchUtils.whenFalseOnce(this, "view.updating", () => {
            this.layerListViewModel.operationalItems.forEach(() => {
              this.searchExpressions.add(null);
            });
            this._storeFeatureData();
          })
        ]);
      }),
      watchUtils.on(this, "featureLayerViews", "change", () => {
        this.selectedStyleDataCollection.removeAll();
        const selectedStyleDataCollection = [];
        this.featureLayerViews.forEach(
          (featureLayerView: __esri.FeatureLayerView) => {
            if (!featureLayerView) {
              selectedStyleDataCollection.push(null);
            } else {
              const featureLayer = featureLayerView.get(
                  "layer"
                ) as __esri.FeatureLayer,
                renderer = featureLayer.get("renderer") as any,
                field = renderer && renderer.get("field"),
                field2 = renderer && renderer.get("field2"),
                field3 = renderer && renderer.get("field3"),
                fieldDelimiter = renderer && renderer.get("fieldDelimiter"),
                normalizationField =
                  renderer && renderer.get("normalizationField"),
                normalizationType =
                  renderer && renderer.get("normalizationType"),
                hasCustomArcade =
                  (field2 || field3) && fieldDelimiter ? true : false,
                invalidNormalization =
                  normalizationType === "percent-of-total" ||
                  normalizationType === "log";
              if (hasCustomArcade || invalidNormalization) {
                selectedStyleDataCollection.push(null);
              } else {
                const selectedStyleData = new SelectedStyleData({
                  layerItemId: featureLayer.id,
                  field,
                  selectedInfoIndex: [],
                  applyStyles: null,
                  featureLayerView,
                  normalizationField
                });
                selectedStyleDataCollection.push(selectedStyleData);
              }
            }
          }
        );
        this.selectedStyleDataCollection.addMany([
          ...selectedStyleDataCollection
        ]);
      }),
      watchUtils.watch(this, "filterMode", () => {
        this.selectedStyleDataCollection.forEach((selectedStyleData) => {
          if (this.filterMode === "featureFilter") {
            const filter = selectedStyleData?.featureLayerView?.effect?.filter;
            if (filter) {
              selectedStyleData.featureLayerView.effect = null;
              selectedStyleData.featureLayerView.filter = filter;
            }
          } else if (this.filterMode === "mute") {
            const filter = selectedStyleData?.featureLayerView?.filter;
            if (filter) {
              selectedStyleData.featureLayerView.filter = null;
              const { opacity, grayScale } = this;
              const opacityValue = opacity === null ? 30 : opacity;
              const grayScaleValue = grayScale === null ? 100 : grayScale;
              selectedStyleData.featureLayerView.effect = new FeatureEffect({
                excludedEffect: `opacity(${opacityValue}%) grayscale(${grayScaleValue}%)`,
                filter
              });
            }
          }
        });
      }),
      watchUtils.watch(this, "opacity, grayScale", () => {
        this.selectedStyleDataCollection.forEach((selectedStyleData) => {
          if (this.filterMode === "mute") {
            const filter =
              selectedStyleData?.featureLayerView?.filter ||
              selectedStyleData?.featureLayerView?.effect?.filter;
            selectedStyleData.featureLayerView.filter = null;
            const { opacity, grayScale } = this;
            const opacityValue = opacity === null ? 30 : opacity;
            const grayScaleValue = grayScale === null ? 100 : grayScale;
            selectedStyleData.featureLayerView.effect = new FeatureEffect({
              excludedEffect: `opacity(${opacityValue}%) grayscale(${grayScaleValue}%)`,
              filter
            });
          }
        });
      })
    ]);

    this._initFeatureCount();
  }

  destroy() {
    this._handles.removeAll();
    this._handles.destroy();
    this._handles = null;
    this.interactiveStyleData.destroy();
  }

  //----------------------------------
  //
  //  Public methods
  //
  //----------------------------------

  // applyFeatureFilter
  applyFeatureFilter(
    elementInfo: any,
    field: string,
    operationalItemIndex: number,
    legendElement: LegendElement,
    legendInfoIndex: number,
    isPredominance: boolean,
    legendElementInfos?: any[],
    normalizationField?: string
  ): void {
    const queryExpressionsCollection = this.interactiveStyleData.get(
      "queryExpressions"
    ) as __esri.Collection;
    const queryExpressions = queryExpressionsCollection.getItemAt(
      operationalItemIndex
    );
    if (isPredominance) {
      const queryExpression = this._handlePredominanceExpression(
        elementInfo,
        operationalItemIndex
      );

      const expressionIndex = queryExpressions.indexOf(queryExpression);
      if (queryExpressions.length === 0 || expressionIndex === -1) {
        if (queryExpressions && queryExpressions[0] === "1=0") {
          queryExpressions.splice(0, 1);
        }
        queryExpressions.push(queryExpression);
      } else if (
        queryExpressions &&
        queryExpressions.length === 1 &&
        queryExpression === queryExpressions[0]
      ) {
        queryExpressions[0] = "1=0";
      } else if (queryExpressions && queryExpressions.length === 1) {
        queryExpressions[0] = [queryExpression];
      } else if (
        queryExpressions &&
        queryExpressions.length === 1 &&
        queryExpression !== queryExpressions[0] &&
        queryExpressions[0] === "1=0"
      ) {
        queryExpressions[0] = [queryExpression];
        // queryExpressions.push(queryExpression);
      } else if (
        queryExpressions &&
        queryExpressions.length === 1 &&
        queryExpression === queryExpressions[0] &&
        queryExpressions[0] === "1=0"
      ) {
        queryExpressions[0] = [];
      } else {
        queryExpressions.splice(expressionIndex, 1);
      }

      const featureLayerView = this.featureLayerViews.getItemAt(
        operationalItemIndex
      );
      const filterExpression = queryExpressions.join(" OR ");
      this._setSearchExpression(filterExpression);
      featureLayerView.filter = new FeatureFilter({
        where: filterExpression
      });
    } else {
      this._generateQueryExpressions(
        elementInfo,
        field,
        operationalItemIndex,
        legendElement,
        legendInfoIndex,
        legendElementInfos,
        normalizationField
      );

      const featureLayerView = this.featureLayerViews.getItemAt(
        operationalItemIndex
      );
      const filterExpression = queryExpressions.join(" OR ");
      this._setSearchExpression(filterExpression);
      featureLayerView.filter = new FeatureFilter({
        where: filterExpression
      });
    }
  }

  // applyFeatureMute
  applyFeatureMute(
    elementInfo: any,
    field: string,
    legendInfoIndex: number,
    operationalItemIndex: number,
    legendElement: LegendElement,
    legendElementInfos: any[],
    isPredominance: boolean,
    normalizationField: string
  ): void {
    const queryExpressionsCollection = this.interactiveStyleData.get(
      "queryExpressions"
    ) as __esri.Collection;
    const queryExpressions = queryExpressionsCollection.getItemAt(
      operationalItemIndex
    );

    const { opacity, grayScale } = this;

    const opacityValue = opacity === null ? 30 : opacity;
    const grayScaleValue = grayScale === null ? 100 : grayScale;
    if (isPredominance) {
      const queryExpression = this._handlePredominanceExpression(
        elementInfo,
        operationalItemIndex
      );

      const expressionIndex = queryExpressions.indexOf(queryExpression);
      if (queryExpressions.length === 0 || expressionIndex === -1) {
        if (queryExpressions && queryExpressions[0] === "1=0") {
          queryExpressions.splice(0, 1);
        }
        queryExpressions.push(queryExpression);
      } else if (
        queryExpressions &&
        queryExpressions.length === 1 &&
        queryExpression === queryExpressions[0]
      ) {
        queryExpressions[0] = "1=0";
      } else if (queryExpressions && queryExpressions.length === 1) {
        queryExpressions[0] = [queryExpression];
      } else if (
        queryExpressions &&
        queryExpressions.length === 1 &&
        queryExpression !== queryExpressions[0] &&
        queryExpressions[0] === "1=0"
      ) {
        queryExpressions[0] = [queryExpression];
        // queryExpressions.push(queryExpression);
      } else if (
        queryExpressions &&
        queryExpressions.length === 1 &&
        queryExpression === queryExpressions[0] &&
        queryExpressions[0] === "1=0"
      ) {
        queryExpressions[0] = [];
      } else {
        queryExpressions.splice(expressionIndex, 1);
      }

      const featureLayerView = this.featureLayerViews.getItemAt(
        operationalItemIndex
      );
      const filterExpression = queryExpressions.join(" OR ");
      this._setSearchExpression(filterExpression);

      featureLayerView.effect = new FeatureEffect({
        excludedEffect: `opacity(${opacityValue}%) grayscale(${grayScaleValue}%)`,
        filter: {
          where: filterExpression
        }
      });
    } else {
      this._generateQueryExpressions(
        elementInfo,
        field,
        operationalItemIndex,
        legendElement,
        legendInfoIndex,
        legendElementInfos,
        normalizationField
      );

      const featureLayerView = this.featureLayerViews.getItemAt(
        operationalItemIndex
      );
      const filterExpression = queryExpressions.join(" OR ");
      this._setSearchExpression(filterExpression);

      featureLayerView.effect = new FeatureEffect({
        excludedEffect: `opacity(${opacityValue}%) grayscale(${grayScaleValue}%)`,
        filter: {
          where: filterExpression
        }
      });
    }
  }

  // resetLegendFilter
  resetLegendFilter(featureLayerData: any, operationalItemIndex: number): void {
    const { featureLayerView, selectedInfoIndex } = featureLayerData;
    const queryExpressionsCollection = this.interactiveStyleData.get(
      "queryExpressions"
    ) as __esri.Collection;
    const queryExpressions = queryExpressionsCollection.getItemAt(
      operationalItemIndex
    );
    if (queryExpressions) {
      queryExpressions.length = 0;
    }

    if (this.filterMode === "featureFilter") {
      featureLayerView.filter = null;
    } else if (this.filterMode === "mute") {
      featureLayerView.effect = null;
    }
    if (selectedInfoIndex.length) {
      selectedInfoIndex.length = 0;
    }
    this._setSearchExpression(null);
    this.notifyChange("state");
  }

  // validateInteractivity
  validateInteractivity(
    activeLayerInfo: __esri.ActiveLayerInfo,
    legendElement: LegendElement,
    field: string,
    featureLayerView: __esri.FeatureLayerView,
    legendElementIndex: number
  ): boolean {
    const { type } = legendElement;
    const classBreakInfos = featureLayerView?.get(
      "layer.renderer.classBreakInfos"
    ) as __esri.ClassBreak[];
    const isSizeRamp = type === "size-ramp";
    const isColorRamp = type === "color-ramp";
    const opacityRamp = type === "opacity-ramp";
    const heatmapRamp = type === "heatmap-ramp";

    const hasMoreThanOneClassBreak =
      featureLayerView && classBreakInfos && classBreakInfos.length > 1;

    const authoringInfoType = featureLayerView?.get(
      "layer.renderer.authoringInfo.type"
    );
    const isPredominance = authoringInfoType === "predominance";
    const classifyDataCheckedColorRamp =
      authoringInfoType === "class-breaks-color";
    const classifyDataCheckedSizeRamp =
      authoringInfoType === "class-breaks-size";

    const singleSymbol = legendElement?.infos?.length === 1 && !field;

    const isRelationship =
      authoringInfoType === "relationship" &&
      legendElement.type !== "size-ramp";

    const featureLayerData = this.selectedStyleDataCollection?.find((data) =>
      data ? activeLayerInfo?.layer?.id === data?.layerItemId : null
    );
    const hasSublayers = activeLayerInfo.get("parent.children.length") > 0;

    const isFeatureLayer = activeLayerInfo?.get("layer.type") === "feature";

    const moreThanOneClassBreak =
      !hasSublayers &&
      isFeatureLayer &&
      field &&
      !isColorRamp &&
      !isSizeRamp &&
      featureLayerData &&
      hasMoreThanOneClassBreak;

    const oneClassBreak =
      !hasSublayers &&
      isFeatureLayer &&
      field &&
      !isColorRamp &&
      !isSizeRamp &&
      featureLayerData &&
      !hasMoreThanOneClassBreak
        ? true
        : false;

    const validate =
      oneClassBreak ||
      (isPredominance && !isSizeRamp) ||
      (classifyDataCheckedColorRamp && field) ||
      (classifyDataCheckedSizeRamp && field) ||
      (singleSymbol && !field && field !== null) ||
      isRelationship
        ? true
        : false;

    const hasClustering =
      activeLayerInfo?.get("layer.featureReduction") &&
      activeLayerInfo?.legendElements[legendElementIndex]?.type === "size-ramp";

    const isSingleSymbol =
      legendElement.type === "symbol-table" &&
      legendElement?.infos?.length === 1;

    const hasColorRamp = !activeLayerInfo?.legendElements.every(
      (legendElement) => legendElement.type !== "color-ramp"
    );

    const hasSizeRamp = !activeLayerInfo?.legendElements.every(
      (legendElement) => legendElement.type !== "size-ramp"
    );

    const singleSymbolColor = isSingleSymbol && hasColorRamp;

    const singleSymbolSize = isSingleSymbol && hasSizeRamp;

    return isFeatureLayer &&
      !hasClustering &&
      !opacityRamp &&
      !heatmapRamp &&
      !hasSublayers &&
      !singleSymbolColor &&
      !singleSymbolSize
      ? classBreakInfos
        ? moreThanOneClassBreak || validate
        : oneClassBreak || validate
      : false;
  }

  // // FEATURE COUNT METHODS
  // _initFeatureCount
  private _initFeatureCount(): void {
    const initFeatureCountKey = "init-feature-count";
    this._handles.add(
      watchUtils.watch(this, "featureCountEnabled", () => {
        this._handles.remove(initFeatureCountKey);
        this._handles.add(
          [this._watchDataForCount(initFeatureCountKey)],
          initFeatureCountKey
        );

        this._updateFeatureCountOnViewUpdate(initFeatureCountKey);
      })
    );
  }

  // _watchDataForCount
  private _watchDataForCount(handlesKey: string): __esri.WatchHandle {
    return watchUtils.when(
      this,
      "layerListViewModel.operationalItems.length",
      () => {
        if (this._handles.has(handlesKey)) {
          this._handles.remove(handlesKey);
        }
        const activeLayerInfosCountKey = "active-layer-infos-count-key";
        this._handles.add(
          watchUtils.when(this, "activeLayerInfos.length", () => {
            if (this._handles.has(activeLayerInfosCountKey)) {
              this._handles.remove(activeLayerInfosCountKey);
            }
            const selectedStyleDataCollectionCountKey =
              "selected-style-data-collection-count-key";
            this._handles.add(
              watchUtils.when(
                this,
                "selectedStyleDataCollection.length",
                () => {
                  if (this._handles.has(selectedStyleDataCollectionCountKey)) {
                    this._handles.remove(selectedStyleDataCollectionCountKey);
                  }
                  this._handleOperationalItemForCount();
                }
              ),
              selectedStyleDataCollectionCountKey
            );
          }),
          activeLayerInfosCountKey
        );
      }
    );
  }

  // _updateFeatureCountOnViewUpdate
  private _updateFeatureCountOnViewUpdate(initFeatureCountKey: string): void {
    const featureCountViewUpdateKey = "feature-count-view-update-key";
    this._handles.remove(featureCountViewUpdateKey);
    this._handles.add(
      [
        watchUtils.whenFalse(this, "view.stationary", () => {
          if (!this.view.stationary) {
            const stationaryIsTrue = "stationary-is-true";
            this._handles.add(
              watchUtils.whenTrueOnce(this, "view.stationary", () => {
                if (this._handles.has(stationaryIsTrue)) {
                  this._handles.remove(stationaryIsTrue);
                }
                this._handles.add(
                  [this._watchDataForCount(initFeatureCountKey)],
                  initFeatureCountKey
                );
              }),
              stationaryIsTrue
            );
          } else {
            const stationaryIsFalse = "stationary-is-false";
            this._handles.add(
              watchUtils.whenFalseOnce(this, "view.interacting", () => {
                if (this._handles.has(stationaryIsFalse)) {
                  this._handles.remove(stationaryIsFalse);
                }
                this._handles.add(
                  [this._watchDataForCount(initFeatureCountKey)],
                  initFeatureCountKey
                );
              }),
              stationaryIsFalse
            );
          }
        })
      ],
      featureCountViewUpdateKey
    );
  }

  // _handleOperationalItemForCount
  private _handleOperationalItemForCount(): void {
    this.layerListViewModel.operationalItems.forEach(
      (operationalItem, operationalItemIndex) => {
        const { featureCount, totalFeatureCount } = this.interactiveStyleData;
        if (!featureCount.getItemAt(operationalItemIndex)) {
          featureCount.add(new Collection(), operationalItemIndex);
        }
        if (totalFeatureCount[operationalItemIndex] === undefined) {
          totalFeatureCount[operationalItemIndex] = null;
        }

        const featureLayerView = this.featureLayerViews.getItemAt(
          operationalItemIndex
        );

        this.activeLayerInfos.forEach((activeLayerInfo) => {
          if (operationalItem.layer.id === activeLayerInfo.layer.id) {
            this._handleActiveLayerInfoForCount(
              activeLayerInfo,
              featureLayerView,
              operationalItemIndex
            );
          }
        });
      }
    );
  }

  // _handleActiveLayerInfoForCount
  private _handleActiveLayerInfoForCount(
    activeLayerInfo: __esri.ActiveLayerInfo,
    featureLayerView: __esri.FeatureLayerView,
    operationalItemIndex: number
  ): void {
    const watchLegendElementsForCount = "watch-legend-elements-for-count";
    this._handles.add(
      watchUtils.whenOnce(activeLayerInfo, "legendElements.length", () => {
        if (this._handles.has(watchLegendElementsForCount)) {
          this._handles.remove(watchLegendElementsForCount);
        }
        activeLayerInfo.legendElements.forEach(
          (legendElement: any, legendElementIndex) => {
            this._handleLegendElementForCount(
              legendElement,
              featureLayerView,
              legendElementIndex,
              operationalItemIndex,
              activeLayerInfo
            );
          }
        );
      }),
      watchLegendElementsForCount
    );
  }

  // _handleLegendElementForCount
  private _handleLegendElementForCount(
    legendElement: LegendElement,
    featureLayerView: __esri.FeatureLayerView,
    legendElementIndex: number,
    operationalItemIndex: number,
    activeLayerInfo: __esri.ActiveLayerInfo
  ): void {
    const isInteractive = this.validateInteractivity(
      activeLayerInfo,
      legendElement,
      activeLayerInfo.get("layer.renderer.field"),
      featureLayerView,
      legendElementIndex
    );
    if (!legendElement?.infos || !isInteractive) {
      return;
    }

    this._handleLayerViewWatcherForCount(
      featureLayerView,
      legendElementIndex,
      operationalItemIndex,
      legendElement,
      activeLayerInfo
    );

    this._handleFeatureCount(
      featureLayerView,
      legendElementIndex,
      operationalItemIndex,
      legendElement,
      activeLayerInfo
    );
  }

  // _handleLayerViewWatcherForCount
  private _handleLayerViewWatcherForCount(
    featureLayerView: __esri.FeatureLayerView,
    legendElementIndex: number,
    operationalItemIndex: number,
    legendElement: LegendElement,
    activeLayerInfo: __esri.ActiveLayerInfo
  ): void {
    const key = `feature-count-${activeLayerInfo.layer.id}-${operationalItemIndex}-${legendElementIndex}`;

    if (!this._handles.has(key) && featureLayerView) {
      this._handles.add(
        watchUtils.whenFalse(featureLayerView, "updating", () => {
          this._handleFeatureCount(
            featureLayerView,
            legendElementIndex,
            operationalItemIndex,
            legendElement,
            activeLayerInfo
          );
        }),
        key
      );
    }
  }

  // _handleFeatureCount
  private _handleFeatureCount(
    featureLayerView: __esri.FeatureLayerView,
    legendElementIndex: number,
    operationalItemIndex: number,
    legendElement: LegendElement,
    activeLayerInfo: __esri.ActiveLayerInfo
  ): void {
    const promises = [];
    legendElement.infos.forEach((info, infoIndex) => {
      this._handleLegendElementForFeatureCount(
        featureLayerView,
        legendElementIndex,
        infoIndex,
        operationalItemIndex,
        legendElement,
        info,
        promises,
        activeLayerInfo
      );
    });
    Promise.all(promises).then((featureCountResponses) => {
      this._handleFeatureCountResponses(
        featureCountResponses,
        operationalItemIndex,
        legendElementIndex
      );
    });
  }

  // _handleLegendElementForFeatureCount
  private _handleLegendElementForFeatureCount(
    featureLayerView: __esri.FeatureLayerView,
    legendElementIndex: number,
    infoIndex: number,
    operationalItemIndex: number,
    legendElement: any,
    info: any,
    promises: Promise<{ featureCountRes: number; infoIndex: number }>[],
    activeLayerInfo: __esri.ActiveLayerInfo
  ): void {
    const handlesKey = featureLayerView
      ? `${featureLayerView.layer.id}-${legendElementIndex}-${infoIndex}`
      : null;
    const selectedStyleData = this.selectedStyleDataCollection.getItemAt(
      operationalItemIndex
    );
    const { field, normalizationField } = selectedStyleData;
    if (!this._handles.has(handlesKey)) {
      const applyFeatureCount = this.validateInteractivity(
        activeLayerInfo,
        legendElement,
        field,
        featureLayerView,
        legendElementIndex
      );
      const isPredominance =
        featureLayerView.get("layer.renderer.authoringInfo.type") ===
        "predominance";

      if (!applyFeatureCount) {
        return;
      }

      const queryExpression = this._generateQueryCountExpression(
        info,
        field,
        infoIndex,
        operationalItemIndex,
        legendElement,
        isPredominance,
        legendElement.infos,
        normalizationField,
        applyFeatureCount
      );

      const query = this._generateFeatureCountQuery(queryExpression);
      promises.push(
        featureLayerView
          .queryFeatureCount(query)
          .then((featureCountRes) => {
            return {
              featureCountRes,
              infoIndex
            };
          })
          .catch((err) => {
            console.warn(
              "Invalid geometry - querying count without geometry: ",
              err
            );
            const queryNoGeometry = this._generateFeatureCountQueryNoGeometry(
              queryExpression
            );
            return featureLayerView
              .queryFeatureCount(queryNoGeometry)
              .then((featureCountRes) => {
                return {
                  featureCountRes,
                  infoIndex
                };
              });
          })
      );
    }
  }

  // _generateFeatureCountQuery
  private _generateFeatureCountQuery(queryExpression: string): __esri.Query {
    const geometry = this.view && this.view.get("extent");
    const outSpatialReference = this.view && this.view.get("spatialReference");
    return new Query({
      where: queryExpression,
      geometry,
      outSpatialReference
    });
  }

  // _generateFeatureCountQueryNoGeometry
  private _generateFeatureCountQueryNoGeometry(
    queryExpression: string
  ): __esri.Query {
    const outSpatialReference = this.view && this.view.get("spatialReference");
    return new Query({
      where: queryExpression,
      outSpatialReference
    });
  }

  // _handleFeatureCountResponses
  private _handleFeatureCountResponses(
    featureCountResObjects: { featureCountRes: number; infoIndex: number }[],
    operationalItemIndex: number,
    legendElementIndex: number
  ): void {
    const featureCountsForLegendElement = featureCountResObjects
      .slice()
      .map((featureCountResObject) => featureCountResObject.featureCountRes);

    const featureCountsForLayer = this.interactiveStyleData.featureCount.getItemAt(
      operationalItemIndex
    );

    featureCountsForLayer.splice(
      legendElementIndex,
      1,
      featureCountsForLegendElement
    );
    const selectedInfoIndexes = this.selectedStyleDataCollection.getItemAt(
      operationalItemIndex
    ).selectedInfoIndex[legendElementIndex];

    if (selectedInfoIndexes?.length > 0) {
      this.updateTotalFeatureCount(operationalItemIndex, legendElementIndex);
    } else {
      this.queryTotalFeatureCount(operationalItemIndex, legendElementIndex);
    }
  }

  // queryTotalFeatureCount
  queryTotalFeatureCount(
    operationalItemIndex: number,
    legendElementIndex: number
  ): void {
    const { totalFeatureCount } = this.interactiveStyleData;
    const featureCountCollection = this.interactiveStyleData.get(
      "featureCount"
    ) as __esri.Collection;

    const featureCountsForLayer = featureCountCollection.getItemAt(
      operationalItemIndex
    );
    const featureCountsForLegendElement = featureCountsForLayer.getItemAt(
      legendElementIndex
    );
    const total =
      featureCountsForLegendElement?.length > 0 &&
      featureCountsForLegendElement.reduce((num1, num2) => num1 + num2);
    totalFeatureCount[operationalItemIndex] = total;
  }

  // updateTotalFeatureCount
  updateTotalFeatureCount(
    operationalItemIndex: number,
    legendElementIndex: number
  ): void {
    const { totalFeatureCount } = this.interactiveStyleData;
    const featureCountsForLegendElement = this.interactiveStyleData.featureCount
      .getItemAt(operationalItemIndex)
      .getItemAt(legendElementIndex);

    const selectedInfoIndexes = this.selectedStyleDataCollection.getItemAt(
      operationalItemIndex
    ).selectedInfoIndex[legendElementIndex];

    let currentTotal = 0;
    selectedInfoIndexes &&
      selectedInfoIndexes.forEach((infoIndex) => {
        currentTotal += featureCountsForLegendElement[infoIndex];
      });

    totalFeatureCount[operationalItemIndex] = currentTotal;
  }
  // End of feature count methods

  // updateExtentToAllFeatures
  // LIMITATION: When complex expressions (normalized fields) are queried against feature services that have Use Standardized Queries set to false - update extent cannot be applied.
  updateExtentToAllFeatures(operationalItemIndex: number): void {
    const layerView = this.featureLayerViews.getItemAt(operationalItemIndex);
    const filterWhere = layerView.get("filter.where");
    const effectWhere = layerView.get("effect.filter.where");
    const featureLayer = this.featureLayerViews.getItemAt(operationalItemIndex)
      .layer;
    const query = new Query();
    const queryExpressions =
      this.filterMode === "featureFilter" ? filterWhere : effectWhere;
    const whereClause = queryExpressions ? `${queryExpressions}` : "1=1";
    query.where = whereClause;
    query.outSpatialReference = this.view.spatialReference;
    featureLayer
      .queryExtent(query)
      .catch((err) => {
        console.error("ERROR: ", err);
      })
      .then((extent) => {
        this.view.goTo(extent);
      });
  }

  //----------------------------------
  //
  //  Private methods
  //
  //----------------------------------

  // _storeFeatureData
  private _storeFeatureData(): void {
    this.layerListViewModel.operationalItems.forEach((operationalItem) => {
      this._setUpDataContainers();
      const featureLayerView = operationalItem.layerView as FeatureLayerView;
      this.featureLayerViews.push(featureLayerView);
    });
  }

  // _setUpDataContainers
  private _setUpDataContainers(): void {
    const { queryExpressions } = this.interactiveStyleData;
    queryExpressions.add([]);
  }

  //----------------------------------
  //
  //  Feature Filter Methods
  //
  //----------------------------------

  // _generateQueryExpressions
  private _generateQueryExpressions(
    elementInfo: any,
    field: string,
    operationalItemIndex: number,
    legendElement: LegendElement,
    legendInfoIndex?: number,
    legendElementInfos?: any[],
    normalizationField?: string,
    generateFeatureCountExpression?: boolean
  ): string {
    const queryExpression = this._generateQueryExpression(
      elementInfo,
      field,
      legendInfoIndex,
      legendElement,
      legendElementInfos,
      normalizationField
    );

    if (!generateFeatureCountExpression) {
      const hasOneValue = legendElementInfos && legendElementInfos.length === 1;

      const queryExpressionsCollection = this.interactiveStyleData.get(
        "queryExpressions"
      ) as __esri.Collection;

      const queryExpressions = queryExpressionsCollection.getItemAt(
        operationalItemIndex
      );

      const expressionIndex = queryExpressions.indexOf(queryExpression);
      if (queryExpressions.length === 0 || expressionIndex === -1) {
        if (queryExpressions && queryExpressions[0] === "1=0") {
          queryExpressions.splice(0, 1);
        }
        queryExpressions.push(queryExpression);
      } else if (
        queryExpressions &&
        queryExpressions.length === 1 &&
        queryExpression === queryExpressions[0] &&
        !hasOneValue
      ) {
        queryExpressions[0] = "1=0";
      } else if (
        queryExpressions &&
        queryExpressions.length === 1 &&
        !hasOneValue
      ) {
        queryExpressions[0] = [queryExpression];
      } else if (
        queryExpressions &&
        queryExpressions.length === 1 &&
        queryExpression !== queryExpressions[0] &&
        queryExpressions[0] === "1=0" &&
        !hasOneValue
      ) {
        queryExpressions[0] = [queryExpression];
        // queryExpressions.push(queryExpression);
      } else if (
        queryExpressions &&
        queryExpressions.length === 1 &&
        queryExpression === queryExpressions[0] &&
        queryExpressions[0] === "1=0" &&
        !hasOneValue
      ) {
        queryExpressions[0] = [];
      } else {
        queryExpressions.splice(expressionIndex, 1);
      }
    } else {
      return queryExpression;
    }
  }

  // _generateQueryExpression
  private _generateQueryExpression(
    elementInfo: any,
    field: string,
    legendInfoIndex: number,
    legendElement: LegendElement,
    legendElementInfos?: any[],
    normalizationField?: string
  ): string {
    const { value } = elementInfo;
    if (legendElement.type === "symbol-table") {
      // Classify data size/color ramp
      if (
        !elementInfo.hasOwnProperty("value") ||
        (Array.isArray(elementInfo.value) && legendElementInfos.length === 1)
      ) {
        // Classify data size/color ramp - 'Other' category
        if (
          legendElementInfos[0].hasOwnProperty("value") &&
          Array.isArray(legendElementInfos[0].value) &&
          legendElementInfos[legendElementInfos.length - 2] &&
          legendElementInfos[legendElementInfos.length - 2].hasOwnProperty(
            "value"
          ) &&
          Array.isArray(legendElementInfos[legendElementInfos.length - 2].value)
        ) {
          const expression = normalizationField
            ? `((${field}/${normalizationField}) > ${
                legendElementInfos[0].value[1]
              }) OR ((${field}/${normalizationField}) < ${
                legendElementInfos[legendElementInfos.length - 2].value[0]
              }) OR ${normalizationField} = 0 OR ${normalizationField} IS NULL`
            : `${field} > ${legendElementInfos[0].value[1]} OR ${field} < ${
                legendElementInfos[legendElementInfos.length - 2].value[0]
              } OR ${field} IS NULL`;
          return expression;
        } else if (legendElementInfos.length === 1) {
          return "1=0";
        } else {
          // Types unique symbols - 'Other' category
          const expressionList = [];
          legendElementInfos.forEach((legendElementInfo) => {
            if (legendElementInfo.value) {
              const { value } = legendElementInfo;
              const singleQuote =
                value.indexOf("'") !== -1 ? value.split("'").join("''") : null;
              const expression = singleQuote
                ? `${field} <> '${singleQuote}'`
                : isNaN(value)
                ? `${field} <> '${value}'`
                : `${field} <> ${value} AND ${field} <> '${value}'`;
              expressionList.push(expression);
            }
          });
          const noExpression = expressionList.join(" AND ");
          return field ? `${noExpression} OR ${field} IS NULL` : "";
        }
      } else {
        const singleQuote =
          value.indexOf("'") !== -1 ? value.split("'").join("''") : null;
        const isArray = Array.isArray(elementInfo.value);
        const isLastElement = legendElementInfos.length - 1 === legendInfoIndex;
        const lastElementAndNoValue = !legendElementInfos[
          legendElementInfos.length - 1
        ].hasOwnProperty("value");
        const secondToLastElement =
          legendInfoIndex === legendElementInfos.length - 2;
        const expression = isArray
          ? normalizationField
            ? isLastElement || (lastElementAndNoValue && secondToLastElement)
              ? `(${field}/${normalizationField}) >= ${value[0]} AND (${field}/${normalizationField}) <= ${elementInfo.value[1]}`
              : `(${field}/${normalizationField}) > ${value[0]} AND (${field}/${normalizationField}) <= ${elementInfo.value[1]}`
            : isLastElement || (lastElementAndNoValue && secondToLastElement)
            ? `${field} >= ${value[0]} AND ${field} <= ${value[1]}`
            : `${field} > ${value[0]} AND ${field} <= ${value[1]}`
          : legendElementInfos.length === 1 && field
          ? isNaN(value) || !value.trim().length
            ? `${field} <> '${value}'`
            : `${field} <> ${value} OR ${field} <> '${value}'`
          : singleQuote
          ? `${field} = '${singleQuote}'`
          : isNaN(value) || !value.trim().length
          ? `${field} = '${value}'`
          : `${field} = ${value} OR ${field} = '${value}'`;

        return expression;
      }
    }
  }

  // _handlePredominanceExpression
  private _handlePredominanceExpression(
    elementInfo: any,
    operationalItemIndex: number
  ): string {
    const featureLayerView = this.featureLayerViews.getItemAt(
      operationalItemIndex
    );
    const authoringInfo = featureLayerView
      ? (featureLayerView.layer.renderer.authoringInfo as any)
      : null;
    const fields = authoringInfo ? authoringInfo.fields : null;
    const expressionArr = [];
    if (!fields) {
      return;
    }
    if (elementInfo.hasOwnProperty("value")) {
      fields.forEach((field) => {
        if (elementInfo.value === field) {
          return;
        }
        const sqlQuery = `(${elementInfo.value} > ${field} OR (${field} IS NULL AND ${elementInfo.value} <> 0 AND ${elementInfo.value} IS NOT NULL))`;

        expressionArr.push(sqlQuery);
      });
      return expressionArr.join(" AND ");
    } else {
      const queryForZeroes = [];
      fields.forEach((field) => {
        queryForZeroes.push(`${field} = 0`);
      });

      const otherExpression = [];
      if (fields.length > 2) {
        fields.forEach((field1) => {
          fields.forEach((field2) => {
            if (field1 === field2) {
              return;
            }
            const queryForMultiplePredominance = [];
            fields.forEach((field3) => {
              if (field1 === field3 || field2 === field3) {
                return;
              }
              queryForMultiplePredominance.push(
                `${field1} = ${field2} AND (${field1} > ${field3} OR ${field1} >= ${field3})`
              );
            });
            otherExpression.push(
              `(${queryForMultiplePredominance.join(" AND ")})`
            );
          });
        });

        const isNull = [];

        fields.forEach((field) => {
          isNull.push(`${field} IS NULL`);
        });
        const generatedOtherExpression = `(${queryForZeroes.join(
          " AND "
        )}) OR (${otherExpression.join(" OR ")}) OR (${isNull.join(" AND ")})`;
        return generatedOtherExpression;
      } else {
        const expressions = [];
        fields.forEach((field1) => {
          fields.forEach((field2) => {
            if (field1 === field2) {
              return;
            }
            expressions.push(`${field1} = ${field2}`);
            expressions.push(`(${queryForZeroes.join(" AND ")})`);
          });
        });

        const zeroAndNull = [];
        fields.forEach((field1) => {
          fields.forEach((field2) => {
            if (field1 === field2) {
              return;
            }
            zeroAndNull.push(
              `(${field1} = 0 AND ${field2} IS NULL) OR (${field1} IS NULL AND ${field2} IS NULL)`
            );
          });
        });

        return `(${expressions.join(" OR ")}) OR (${zeroAndNull.join(" OR ")})`;
      }
    }
  }

  // _generateQueryCountExpression
  private _generateQueryCountExpression(
    elementInfo: any,
    field: string,
    legendInfoIndex: number,
    operationalItemIndex: number,
    legendElement: LegendElement,
    isPredominance: boolean,
    legendElementInfos?: any[],
    normalizationField?: string,
    generateFeatureCountExpression?: boolean
  ): string {
    const singleSymbol = legendElementInfos.length === 1;
    if (!singleSymbol) {
      if (isPredominance) {
        const predominanceExpression = this._handlePredominanceExpression(
          elementInfo,
          operationalItemIndex
        );
        return predominanceExpression;
      } else {
        return this._generateQueryExpressions(
          elementInfo,
          field,
          operationalItemIndex,
          legendElement,
          legendInfoIndex,
          legendElementInfos,
          normalizationField,
          generateFeatureCountExpression
        );
      }
    } else {
      const queryExpressionCollection = this.interactiveStyleData.get(
        "queryExpressions"
      ) as __esri.Collection;
      const queryExpressions = queryExpressionCollection.getItemAt(
        operationalItemIndex
      );
      const expression = queryExpressions[0];

      if (
        (expression && expression === "1=0") ||
        (expression && expression.indexOf("<>"))
      ) {
        return "1=0";
      } else {
        return "1=1";
      }
    }
  }

  // _setSearchExpression
  private _setSearchExpression(filterExpression: string): void {
    if (!this.searchViewModel) {
      return;
    }

    this.searchViewModel.sources.forEach(
      (searchSource: __esri.LayerSearchSource) => {
        this.layerListViewModel.operationalItems.forEach((operationalItem) => {
          if (
            searchSource.layer &&
            searchSource.layer.id === operationalItem.layer.id
          ) {
            if (filterExpression) {
              searchSource.filter = {
                where: filterExpression
              };
            } else {
              searchSource.filter = null;
            }
          }
        });
      }
    );
  }

  // _disableClustering
  private _disableClustering(disableClusteringKey: string): void {
    const allLayers = this.get("view.map.allLayers") as __esri.Collection<
      __esri.Layer
    >;

    const layerPromises = [];

    allLayers.forEach((layer) => {
      layerPromises.push(
        layer.load().then((loadedLayer) => {
          return loadedLayer;
        })
      );
    });

    Promise.all(layerPromises).then((layers) => {
      layers.forEach((layerItem) => {
        if (layerItem && layerItem.get("featureReduction")) {
          layerItem.set("featureReduction", null);
        }
      });
      this._handles.remove(disableClusteringKey);
    });
  }
}

export = InteractiveStyleViewModel;
