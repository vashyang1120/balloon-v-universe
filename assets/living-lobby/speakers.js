"use strict";

const LobbySpeakers = (() => {
  // Native map coordinates. Each outer cabinet shares its contour with its upper star.
  const groups = [
    {
      id: 'left', bounds: [1009, 200, 59, 108], anchor: [1039, 302], direction: -1,
      silhouette: [[1019,244],[1023,241],[1028,240],[1028,231],[1020,226],[1019,222],
        [1022,220],[1033,220],[1036,211],[1039,209],[1042,210],[1045,215],[1047,220],
        [1057,220],[1062,222],[1060,227],[1056,230],[1055,233],[1056,241],[1059,243],
        [1062,244],[1063,247],[1062,299],[1055,301],[1029,305],[1028,301],[1027,292],
        [1025,289],[1023,286],[1025,282],[1023,280],[1019,279],[1020,275],[1022,271],
        [1020,269],[1017,268],[1017,261]],
      clip: [[1011,200],[1066,200],[1066,295],[1062,299],[1054,301],[1028,305],
        [1027,296],[1026,291],[1024,288],[1025,282],[1023,280],[1018,279],[1019,275],
        [1022,271],[1020,269],[1016,268],[1014,267],[1011,267]]
    },
    {
      id: 'right', bounds: [1302, 232, 57, 115], anchor: [1329, 340], direction: 1,
      silhouette: [[1306,278],[1309,275],[1314,274],[1313,267],[1314,263],[1308,257],
        [1307,252],[1311,250],[1321,250],[1324,243],[1328,236],[1332,237],[1336,244],
        [1338,250],[1347,251],[1352,253],[1353,256],[1351,260],[1347,264],[1347,275],
        [1350,276],[1353,278],[1352,295],[1352,330],[1354,332],[1353,335],[1345,336],
        [1341,339],[1328,342],[1323,342],[1321,339],[1317,338],[1317,333],[1320,330],
        [1324,326],[1325,322],[1323,319],[1318,317],[1314,317],[1313,313],[1311,311],
        [1307,312],[1305,316],[1304,318],[1304,292]],
      clip: [[1303,232],[1358,232],[1358,327],[1354,330],[1355,334],[1348,337],
        [1341,339],[1327,343],[1323,342],[1321,339],[1317,338],[1317,333],[1320,330],
        [1324,326],[1325,322],[1323,319],[1318,317],[1314,317],[1313,313],[1311,311],
        [1307,312],[1305,316],[1303,318],[1303,277],[1306,265],[1304,254]]
    },
    {
      id: 'inner-left', bounds: [1066, 215, 51, 85], anchor: [1092, 293], direction: -1,
      silhouette: [[1070,227],[1076,224],[1081,221],[1084,224],[1099,226],
        [1110,226],[1112,229],[1112,237],[1110,240],[1110,280],[1109,285],
        [1109,293],[1102,295],[1096,295],[1094,289],[1091,287],[1088,288],
        [1086,293],[1083,294],[1082,290],[1079,287],[1076,288],[1074,292],
        [1069,291],[1069,276],[1070,249]],
      clip: [[1066,216],[1080,216],[1081,221],[1086,224],[1102,226],
        [1113,225],[1116,231],[1114,235],[1110,239],[1110,283],[1110,291],
        [1107,295],[1096,295],[1094,289],[1091,287],[1088,288],[1086,293],
        [1083,294],[1082,290],[1079,287],[1076,288],[1074,292],[1066,291]]
    },
    {
      id: 'inner-right', bounds: [1265, 232, 39, 90], anchor: [1287, 313], direction: 1,
      silhouette: [[1269,241],[1273,238],[1279,236],[1285,237],[1293,238],
        [1303,239],[1303,317],[1295,318],[1294,314],[1293,312],[1290,311],
        [1288,312],[1286,315],[1284,314],[1284,310],[1282,308],[1279,309],
        [1278,313],[1275,312],[1275,308],[1272,307],[1270,307],[1268,309],
        [1267,308],[1268,260],[1270,255],[1270,247]],
      clip: [[1265,239],[1274,235],[1279,233],[1281,236],[1287,237],
        [1303,238],[1303,317],[1295,318],[1294,314],[1293,312],[1290,311],
        [1288,312],[1286,315],[1284,314],[1284,310],[1282,308],[1279,309],
        [1278,313],[1275,312],[1275,308],[1272,307],[1270,307],[1268,309],
        [1266,307],[1267,262],[1269,256],[1269,247]]
    }
  ];
  const crop = [998, 147, 371, 215];

  function canvas(width, height) {
    const layer = document.createElement('canvas');
    layer.width = width;
    layer.height = height;
    return layer;
  }

  function path(ctx, points, x, y) {
    ctx.beginPath();
    points.forEach(([px, py], i) => i ? ctx.lineTo(px-x, py-y) : ctx.moveTo(px-x, py-y));
    ctx.closePath();
  }

  function prepareGroup(map, group) {
    const [x, y, width, height] = group.bounds;
    const region = canvas(width, height);
    const read = region.getContext('2d', {willReadFrequently:true});
    read.drawImage(map, x, y, width, height, 0, 0, width, height);
    const original = read.getImageData(0, 0, width, height);
    read.clearRect(0, 0, width, height);
    path(read, group.silhouette, x, y);
    read.fill();
    const mask = read.getImageData(0, 0, width, height).data;
    const sprite = canvas(width, height);
    const plate = canvas(width, height);
    const frame = canvas(width, height);
    const clipped = canvas(width, height);
    const art = read.createImageData(width, height);
    const repair = read.createImageData(width, height);
    art.data.set(original.data);
    repair.data.set(original.data);
    for (let row = 0; row < height; row++) {
      for (let column = 0; column < width; column++) {
        const at = (row*width+column)*4;
        const alpha = mask[at+3];
        art.data[at+3] = alpha;
        if (!alpha) continue;
        // Only a narrow rim is ever exposed. Borrow the closest visible background
        // pixel from outside the original contour. The opaque sprite covers the core.
        let best = 10.01;
        let nearest = at;
        for (let dy = -3; dy <= 3; dy++) {
          for (let dx = -3; dx <= 3; dx++) {
            const distance = dx*dx+dy*dy;
            const rx = column+dx, ry = row+dy;
            if (distance >= best || rx < 0 || rx >= width || ry < 0 || ry >= height) continue;
            const sample = (ry*width+rx)*4;
            if (mask[sample+3]) continue;
            best = distance;
            nearest = sample;
          }
        }
        for (let channel = 0; channel < 3; channel++) {
          repair.data[at+channel] = original.data[nearest+channel];
        }
      }
    }
    sprite.getContext('2d').putImageData(art, 0, 0);
    plate.getContext('2d').putImageData(repair, 0, 0);
    const trim = clipped.getContext('2d');
    path(trim, group.clip, x, y);
    trim.clip();
    return {...group, sprite, plate, frame, paint: frame.getContext('2d'), clipped, trim};
  }

  function prepare(map) {
    const comparison = document.querySelector('#speaker-comparison');
    if (!comparison) return {groups: groups.map(group => prepareGroup(map, group))};
    const staticContext = document.querySelector('#speaker-original').getContext('2d');
    const liveContext = document.querySelector('#speaker-live').getContext('2d');
    staticContext.drawImage(map, ...crop, 0, 0, crop[2], crop[3]);
    return {groups: groups.map(group => prepareGroup(map, group)), comparison, liveContext};
  }

  function beatPose(seconds, envelope, settings, direction) {
    const [, period, delay] = settings.defaults;
    const {keyframes} = settings;
    const left = envelope(seconds, period, 0, keyframes);
    const right = envelope(seconds, period, delay, keyframes);
    const own = direction < 0 ? left : right;
    const other = direction < 0 ? right : left;
    const beat = own + .68*other;
    const strength = Math.max(0, beat);
    return {sx: 1+.035*strength, sy: 1+.031*strength,
      shear: -direction*(.006*strength+.004*Math.min(0, beat)),
      opacity: Math.min(1, Math.abs(beat)*12)};
  }

  function paint(ctx, state, seconds, envelope, settings) {
    for (const group of state.groups) {
      const pose = beatPose(seconds, envelope, settings, group.direction);
      if (pose.opacity < .001) continue;
      const [x, y, width, height] = group.bounds;
      const [ax, ay] = group.anchor;
      const layer = group.paint;
      layer.clearRect(0, 0, width, height);
      layer.drawImage(group.plate, 0, 0);
      layer.save();
      layer.translate(ax-x, ay-y);
      layer.transform(pose.sx, 0, pose.shear, pose.sy, 0, 0);
      layer.drawImage(group.sprite, x-ax, y-ay);
      layer.restore();
      // Hold the stage, inner cabinets, floor contacts and foreground décor still.
      group.trim.clearRect(0, 0, width, height);
      group.trim.drawImage(group.frame, 0, 0);
      ctx.save();
      ctx.globalAlpha = pose.opacity;
      ctx.drawImage(group.clipped, x, y);
      ctx.restore();
    }
  }

  function compare(state, scene) {
    if (!state.comparison.open) return;
    const {liveContext} = state;
    liveContext.clearRect(0, 0, crop[2], crop[3]);
    liveContext.drawImage(scene, ...crop, 0, 0, crop[2], crop[3]);
  }

  return {prepare, paint, compare, beatPose};
})();
