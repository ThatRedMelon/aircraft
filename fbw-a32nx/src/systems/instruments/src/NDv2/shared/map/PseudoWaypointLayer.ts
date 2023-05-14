import { NdSymbol, NdSymbolTypeFlags } from '@shared/NavigationDisplay';
import { MapLayer } from './MapLayer';
import { MapParameters } from '../../../ND/utils/MapParameters';
import { PaintUtils } from './PaintUtils';

const START_OF_CLIMB_PATH = new Path2D('M 0 0 h 22.2 l 19.8 -16.2 m -6 0 h 6 v 6');
const LEVEL_OFF_CLIMB_PATH = new Path2D('M -42 16.2 l 19.8 -16.2 h 22.2 m -4.2 -4.2 l 4.2 4.2 l -4.2 4.2');
const START_OF_DESCENT_PATH = new Path2D('M 0 0 h 22.2 l 19.8 16.2 m -6 0 h 6 v -6');
const LEVEL_OFF_DESCENT_PATH = new Path2D('M -42 -16.2 l 19.8 16.2 h 22.2 m -4.2 -4.2 l 4.2 4.2 l -4.2 4.2');
const INTERCEPT_PROFILE_PATH = new Path2D('M -38, 0 l 14, -17 v 34 l 14 -17 h10 m -5 -5 l 5 5 l -5 5');

export class PseudoWaypointLayer implements MapLayer<NdSymbol> {
    data: NdSymbol[] = [];

    paintShadowLayer(context: CanvasRenderingContext2D, mapWidth: number, mapHeight: number, mapParameters: MapParameters) {
        for (const symbol of this.data) {
            const [x, y] = mapParameters.coordinatesToXYy(symbol.location);
            const rx = x + mapWidth / 2;
            const ry = y + mapHeight / 2;

            this.paintPseudoWaypoint(false, context, rx, ry, symbol);
        }
    }

    paintColorLayer(context: CanvasRenderingContext2D, mapWidth: number, mapHeight: number, mapParameters: MapParameters) {
        for (const symbol of this.data) {
            const [x, y] = mapParameters.coordinatesToXYy(symbol.location);
            const rx = x + mapWidth / 2;
            const ry = y + mapHeight / 2;

            this.paintPseudoWaypoint(true, context, rx, ry, symbol);
        }
    }

    private paintPseudoWaypoint(isColorLayer: boolean, context: CanvasRenderingContext2D, x: number, y: number, symbol: NdSymbol) {
        const color = isColorLayer ? typeFlagToColor(symbol.type) : '#000';
        context.strokeStyle = color;

        if (symbol.type & (NdSymbolTypeFlags.PwpStartOfClimb)) {
            this.paintPath(context, x, y, START_OF_CLIMB_PATH);
        } else if (symbol.type & (NdSymbolTypeFlags.PwpClimbLevelOff)) {
            this.paintPath(context, x, y, LEVEL_OFF_CLIMB_PATH);
        } else if (symbol.type & (NdSymbolTypeFlags.PwpTopOfDescent)) {
            this.paintPath(context, x, y, START_OF_DESCENT_PATH);
        } else if (symbol.type & (NdSymbolTypeFlags.PwpDescentLevelOff)) {
            this.paintPath(context, x, y, LEVEL_OFF_DESCENT_PATH);
        } else if (symbol.type & (NdSymbolTypeFlags.PwpInterceptProfile)) {
            this.paintPath(context, x, y, INTERCEPT_PROFILE_PATH);
        } else if (symbol.type & (NdSymbolTypeFlags.PwpCdaFlap1)) {
            this.paintCdaPoint(context, x, y, '1', color);
        } else if (symbol.type & (NdSymbolTypeFlags.PwpCdaFlap2)) {
            this.paintCdaPoint(context, x, y, '2', color);
        } else if (symbol.type & (NdSymbolTypeFlags.PwpDecel)) {
            this.paintCdaPoint(context, x, y, 'D', color);
        } else if (symbol.type & (NdSymbolTypeFlags.PwpTimeMarker)) {
            this.paintCdaPoint(context, x, y, '', '#0f0');
        } else if (symbol.type & (NdSymbolTypeFlags.PwpSpeedChange)) {
            context.fillStyle = color;
            context.strokeStyle = 'none';
            this.paintSpeedChange(context, x, y);
        }
    }

    private paintPath(context: CanvasRenderingContext2D, x: number, y: number, path: Path2D) {
        context.translate(x, y);
        context.beginPath();
        context.stroke(path);
        context.closePath();
        context.resetTransform();
    }

    private paintCdaPoint(context: CanvasRenderingContext2D, x: number, y: number, centerSymbol: string, color: string) {
        context.beginPath();
        context.ellipse(x, y, 14, 14, 0, 0, Math.PI * 2);
        context.stroke();
        context.closePath();

        PaintUtils.paintText(true, context, x, y + 3, centerSymbol, color);
    }

    private paintSpeedChange(context: CanvasRenderingContext2D, x: number, y: number) {
        context.beginPath();
        context.ellipse(x, y, 8, 8, 0, 0, Math.PI * 2);
        context.fill();
        context.closePath();
    }
}

const typeFlagToColor = (typeFlag: NdSymbolTypeFlags) => {
    if (typeFlag & NdSymbolTypeFlags.MagentaColor) {
        return '#ff94ff';
    } if (typeFlag & NdSymbolTypeFlags.AmberColor) {
        return '#e68000';
    } if (typeFlag & NdSymbolTypeFlags.CyanColor) {
        return '#00ffff';
    }

    return '#fff';
};
