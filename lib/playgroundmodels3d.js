"use strict";

// Optional procedural model factories for playground equipment.
const PlaygroundModelFactories = {
    aerialrotator(T) {
        const group = new T.Group();
        const blue = new T.MeshStandardMaterial({ color: 0x2988c9, roughness: 0.7 });
        const metal = new T.MeshStandardMaterial({ color: 0x999999, roughness: 0.6 });
        const base = new T.Mesh(new T.CylinderGeometry(0.9, 0.9, 0.15, 16), blue);
        base.position.y = 0.075;
        group.add(base);
        const post = new T.Mesh(new T.CylinderGeometry(0.07, 0.07, 1.8, 8), metal);
        post.position.y = 0.9;
        group.add(post);
        const ring = new T.Mesh(new T.TorusGeometry(0.65, 0.055, 6, 16), blue);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 1.5;
        group.add(ring);
        return group;
    },
    basketrotator(T) {
        const group = new T.Group();
        const red = new T.MeshStandardMaterial({ color: 0xc94c45, roughness: 0.7 });
        const metal = new T.MeshStandardMaterial({ color: 0x999999, roughness: 0.6 });
        const base = new T.Mesh(new T.CylinderGeometry(0.75, 0.55, 0.2, 16), red);
        base.position.y = 0.3;
        group.add(base);
        const rim = new T.Mesh(new T.TorusGeometry(0.8, 0.06, 6, 16), red);
        rim.rotation.x = Math.PI / 2;
        rim.position.y = 0.85;
        group.add(rim);
        for (let i = 0; i < 8; i++) {
            const angle = i * Math.PI / 4;
            const post = new T.Mesh(new T.CylinderGeometry(0.035, 0.035, 0.5, 6), metal);
            post.position.set(Math.cos(angle) * 0.7, 0.6, Math.sin(angle) * 0.7);
            group.add(post);
        }
        return group;
    },
    activitypanel(T) {
        const group = new T.Group();
        const blue = new T.MeshStandardMaterial({ color: 0x2988c9, roughness: 0.7 });
        const red = new T.MeshStandardMaterial({ color: 0xc94c45, roughness: 0.7 });
        const panel = new T.Mesh(new T.BoxGeometry(1.3, 0.9, 0.1), blue);
        panel.position.y = 1;
        group.add(panel);
        for (const x of [-0.7, 0.7]) {
            const post = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, 1.6, 8), red);
            post.position.set(x, 0.8, 0);
            group.add(post);
        }
        for (const x of [-0.35, 0, 0.35]) {
            const disk = new T.Mesh(new T.CylinderGeometry(0.12, 0.12, 0.03, 12), red);
            disk.rotation.x = Math.PI / 2;
            disk.position.set(x, 1, 0.07);
            group.add(disk);
        }
        return group;
    },
    komyaku_eye(T) {
        const group = new T.Group();
        const blue = new T.MeshStandardMaterial({ color: 0x00b5d9, roughness: 0.45 });
        const white = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45 });
        const red = new T.MeshStandardMaterial({ color: 0xff2945, roughness: 0.4 });
        const base = new T.Mesh(new T.CylinderGeometry(1.6, 1.6, 0.04, 32), blue);
        base.position.y = 0.02;
        group.add(base);
        // Adjacent spherical bands form one continuous flattened dome.
        const pupilEnd = Math.asin(0.25);
        const whiteEnd = Math.asin(0.5);
        for (const [start, end, material] of [
            [0, pupilEnd, blue],
            [pupilEnd, whiteEnd, white],
            [whiteEnd, Math.PI / 2, red]
        ]) {
            const band = new T.Mesh(new T.SphereGeometry(1.15, 32, 12,
                0, Math.PI * 2, start, end - start), material);
            band.scale.y = 0.36;
            band.position.y = 0.04;
            group.add(band);
        }
        return group;
    },
    cushion(T) {
        const group = new T.Group();
        const colors = [0xf5f5f5, 0x2988c9, 0xc94c45];
        for (let i = 0; i < 7; i++) {
            const angle = i * Math.PI / 3;
            const blob = new T.Mesh(new T.SphereGeometry(0.55, 12, 8),
                new T.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.9 }));
            blob.scale.y = 0.65;
            blob.position.set(i === 6 ? 0 : Math.cos(angle) * 0.7, 0.36,
                i === 6 ? 0 : Math.sin(angle) * 0.7);
            group.add(blob);
        }
        return group;
    },
    horizontal_bar(T) {
        const group = new T.Group();
        const metal = new T.MeshStandardMaterial({
            color: 0x66757f,
            roughness: 0.65,
            metalness: 0.35
        });
        const postGeometry = new T.CylinderGeometry(0.06, 0.06, 1.9, 8);
        const barGeometry = new T.CylinderGeometry(0.045, 0.045, 1.4, 8);
        barGeometry.rotateZ(Math.PI / 2);

        [-2.1, -0.7, 0.7, 2.1].forEach(x => {
            const post = new T.Mesh(postGeometry, metal);
            post.position.set(x, 0.95, 0);
            group.add(post);
        });
        [
            { x: -1.4, y: 1.25 },
            { x: 0.0, y: 1.50 },
            { x: 1.4, y: 1.75 }
        ].forEach(spec => {
            const bar = new T.Mesh(barGeometry, metal);
            bar.position.set(spec.x, spec.y, 0);
            group.add(bar);
        });
        return group;
    },

    springy(T) {
        const group = new T.Group();
        const metal = new T.MeshStandardMaterial({
            color: 0x59636b,
            roughness: 0.6,
            metalness: 0.4
        });
        const bodyMaterial = new T.MeshStandardMaterial({ color: 0xe79a3b, roughness: 0.75 });

        const base = new T.Mesh(new T.CylinderGeometry(0.28, 0.32, 0.12, 10), metal);
        base.position.y = 0.06;
        group.add(base);

        const points = [];
        const turns = 4;
        const segments = 40;
        for (let i = 0; i <= segments; i += 1) {
            const f = i / segments;
            const a = f * Math.PI * 2 * turns;
            points.push(new T.Vector3(
                Math.cos(a) * 0.17,
                0.16 + f * 0.58,
                Math.sin(a) * 0.17
            ));
        }
        const spring = new T.Mesh(
            new T.TubeGeometry(new T.CatmullRomCurve3(points), 48, 0.045, 6, false),
            metal
        );
        group.add(spring);

        const support = new T.Mesh(new T.CylinderGeometry(0.08, 0.08, 0.24, 8), metal);
        support.position.y = 0.84;
        group.add(support);

        const body = new T.Mesh(new T.BoxGeometry(1.05, 0.28, 0.38), bodyMaterial);
        body.position.y = 1.03;
        group.add(body);
        const seat = new T.Mesh(new T.BoxGeometry(0.62, 0.10, 0.46), bodyMaterial);
        seat.position.set(-0.12, 1.21, 0);
        group.add(seat);

        const handleGeometry = new T.CylinderGeometry(0.035, 0.035, 0.72, 8);
        handleGeometry.rotateX(Math.PI / 2);
        const handle = new T.Mesh(handleGeometry, metal);
        handle.position.set(0.34, 1.30, 0);
        group.add(handle);
        const footGeometry = new T.CylinderGeometry(0.03, 0.03, 0.62, 8);
        footGeometry.rotateX(Math.PI / 2);
        const foot = new T.Mesh(footGeometry, metal);
        foot.position.set(-0.24, 0.94, 0);
        group.add(foot);
        return group;
    },

    basket_swing(T) {
        const group = new T.Group();
        const metal = new T.MeshStandardMaterial({
            color: 0x5f6b73,
            roughness: 0.6,
            metalness: 0.4
        });
        const rope = new T.MeshStandardMaterial({ color: 0x30343a, roughness: 0.9 });
        const seat = new T.MeshStandardMaterial({ color: 0x2f5f72, roughness: 0.8 });

        const beamBetween = (a, b, radius, material, segments = 8) => {
            const start = new T.Vector3(...a);
            const end = new T.Vector3(...b);
            const delta = end.clone().sub(start);
            const mesh = new T.Mesh(
                new T.CylinderGeometry(radius, radius, delta.length(), segments),
                material
            );
            mesh.position.copy(start).add(end).multiplyScalar(0.5);
            mesh.quaternion.setFromUnitVectors(
                new T.Vector3(0, 1, 0),
                delta.clone().normalize()
            );
            group.add(mesh);
        };

        [-1.65, 1.65].forEach(x => {
            beamBetween([x, 0, -0.85], [x, 2.35, 0], 0.065, metal);
            beamBetween([x, 0, 0.85], [x, 2.35, 0], 0.065, metal);
        });
        beamBetween([-1.75, 2.35, 0], [1.75, 2.35, 0], 0.075, metal);

        const ring = new T.Mesh(new T.TorusGeometry(0.62, 0.055, 6, 20), seat);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.82;
        group.add(ring);

        for (let i = 0; i < 8; i += 1) {
            const a = i * Math.PI / 8;
            beamBetween(
                [Math.cos(a) * 0.56, 0.82, Math.sin(a) * 0.56],
                [-Math.cos(a) * 0.56, 0.82, -Math.sin(a) * 0.56],
                0.012,
                rope,
                5
            );
        }
        [
            [-0.52, 2.30, 0, -0.48, 0.90, -0.34],
            [-0.52, 2.30, 0, -0.48, 0.90, 0.34],
            [0.52, 2.30, 0, 0.48, 0.90, -0.34],
            [0.52, 2.30, 0, 0.48, 0.90, 0.34]
        ].forEach(v => beamBetween(v.slice(0, 3), v.slice(3, 6), 0.018, rope, 6));
        return group;
    },

};
