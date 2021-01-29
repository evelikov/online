/* eslint-disable */

/*
 * CPolyUtil contains utility functions for polygons (clipping, etc.).
 */

namespace CPolyUtil {

	class CCodedPoint extends CPoint {
		code: number;

		static fromPointAndCode(pt: CPoint, code: number): CCodedPoint {
			var ptc = new CCodedPoint(pt.x, pt.y);
			ptc.code = code;
			return ptc;
		}
	}

	/*
	* Sutherland-Hodgeman polygon clipping algorithm.
	* Used to avoid rendering parts of a polygon that are not currently visible.
	*/
	export function clipPolygon(points: Array<CPoint>, bounds: CBounds, round: boolean): Array<CPoint> {
		var clippedPoints: Array<CCodedPoint> = [];
		var edges = [1, 4, 2, 8];
		var i: number;
		var j: number;
		var k: number;
		var a: CCodedPoint;
		var b: CCodedPoint;
		var len: number;
		var edge: number;
		var p: CCodedPoint;
		var pointsWithCode: Array<CCodedPoint> = [];
		var lu = CLineUtil;

		for (i = 0, len = points.length; i < len; i++) {
			var code = lu._getBitCode(points[i], bounds);
			pointsWithCode.push(CCodedPoint.fromPointAndCode(points[i], code));
		}

		// for each edge (left, bottom, right, top)
		for (k = 0; k < 4; k++) {
			edge = edges[k];
			clippedPoints = [];

			for (i = 0, len = points.length, j = len - 1; i < len; j = i++) {
				a = pointsWithCode[i];
				b = pointsWithCode[j];

				// if a is inside the clip window
				if (!(a.code & edge)) {
					// if b is outside the clip window (a->b goes out of screen)
					if (b.code & edge) {
						var ptInter = lu._getEdgeIntersection(b, a, edge, bounds, round);
						p = CCodedPoint.fromPointAndCode(ptInter, lu._getBitCode(ptInter, bounds));
						clippedPoints.push(p);
					}
					clippedPoints.push(a);

				// else if b is inside the clip window (a->b enters the screen)
				} else if (!(b.code & edge)) {
					var ptInter = lu._getEdgeIntersection(b, a, edge, bounds, round);
					p = CCodedPoint.fromPointAndCode(ptInter, lu._getBitCode(ptInter, bounds));
					clippedPoints.push(p);
				}
			}
			points = clippedPoints;
		}

		return points;
	}

	function rectanglesToPolygons(rectangles: Array<Array<CPoint>>, unitConverter: (point: CPoint) => CPoint): CPointSet {
		// algorithm found here http://stackoverflow.com/questions/13746284/merging-multiple-adjacent-rectangles-into-one-polygon
		var eps = 20;
		// Glue rectangles if the space between them is less then eps
		for (var i = 0; i < rectangles.length - 1; i++) {
			for (var j = i + 1; j < rectangles.length; j++) {
				for (var k = 0; k < rectangles[i].length; k++) {
					for (var l = 0; l < rectangles[j].length; l++) {
						if (Math.abs(rectangles[i][k].x - rectangles[j][l].x) < eps) {
							rectangles[j][l].x = rectangles[i][k].x;
						}
						if (Math.abs(rectangles[i][k].y - rectangles[j][l].y) < eps) {
							rectangles[j][l].y = rectangles[i][k].y;
						}
					}
				}
			}
		}

		var points = new Map<CPoint, CPoint>();
		for (i = 0; i < rectangles.length; i++) {
			for (j = 0; j < rectangles[i].length; j++) {
				if (points.has(rectangles[i][j])) {
					points.delete(rectangles[i][j]);
				}
				else {
					points.set(rectangles[i][j], rectangles[i][j]);
				}
			}
		}

		function getKeys(points: Map<CPoint, CPoint>): Array<CPoint> {
			var keys: Array<CPoint> = [];
			points.forEach((_: CPoint, key: CPoint) => {
				keys.push(key);
			});
			return keys;
		}

		function xThenY(ap: CPoint, bp: CPoint): number {
			if (ap.x < bp.x || (ap.x === bp.x && ap.y < bp.y)) {
				return -1;
			}
			else if (ap.x === bp.x && ap.y === bp.y) {
				return 0;
			}
			else {
				return 1;
			}
		}

		function yThenX(ap: CPoint, bp: CPoint): number {

			if (ap.y < bp.y || (ap.y === bp.y && ap.x < bp.x)) {
				return -1;
			}
			else if (ap.x === bp.x && ap.y === bp.y) {
				return 0;
			}
			else {
				return 1;
			}
		}

		var sortX = getKeys(points).sort(xThenY);
		var sortY = getKeys(points).sort(yThenX);

		var edgesH = new Map<CPoint, CPoint>();
		var edgesV = new Map<CPoint, CPoint>();

		var len = getKeys(points).length;
		i = 0;
		while (i < len) {
			var currY = points.get(sortY[i]).y;
			while (i < len && points.get(sortY[i]).y === currY) {
				edgesH.set(sortY[i], sortY[i + 1]);
				edgesH.set(sortY[i + 1], sortY[i]);
				i += 2;
			}
		}

		i = 0;
		while (i < len) {
			var currX = points.get(sortX[i]).x;
			while (i < len && points.get(sortX[i]).x === currX) {
				edgesV.set(sortX[i], sortX[i + 1]);
				edgesV.set(sortX[i + 1], sortX[i]);
				i += 2;
			}
		}

		var polygons = new Array<CPointSet>();
		var edgesHKeys = getKeys(edgesH);

		while (edgesHKeys.length > 0) {
			var p: Array<[CPoint, number]> = [[edgesHKeys[0], 0]];
			while (true) {
				var curr = p[p.length - 1][0];
				var e = p[p.length - 1][1];
				if (e === 0) {
					var nextVertex = edgesV.get(curr);
					edgesV.delete(curr);
					p.push([nextVertex, 1]);
				}
				else {
					var nextVertex = edgesH.get(curr);
					edgesH.delete(curr);
					p.push([nextVertex, 0]);
				}
				if (p[p.length - 1][0].equals(p[0][0]) && p[p.length - 1][1] === p[0][1]) {
					p.pop();
					break;
				}
			}
			var polygon = new Array<CPoint>();
			for (i = 0; i < p.length; i++) {
				polygon.push(unitConverter(points.get(p[i][0])));
				edgesH.delete(p[i][0]);
				edgesV.delete(p[i][0]);
			}
			polygon.push(unitConverter(points.get(p[0][0])));
			edgesHKeys = getKeys(edgesH);
			polygons.push(CPointSet.fromPointArray(polygon));
		}
		return CPointSet.fromSetArray(polygons);
	}
}
