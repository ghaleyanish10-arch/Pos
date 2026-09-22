package repo

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mesa-os/backend/internal/model"
)

type TicketRepo struct {
	db *pgxpool.Pool
}

func NewTicketRepo(db *pgxpool.Pool) *TicketRepo {
	return &TicketRepo{db: db}
}

func (r *TicketRepo) List(ctx context.Context, station, status string) ([]model.KDSTicket, error) {
	query := `SELECT t.id, t.order_id, COALESCE(o.type, 'dine-in'), COALESCE(ft.name, ''), COALESCE(t.tag, ''), t.station, t.status, t.ai_phone, COALESCE(t.allergy, ''), t.fired, t.linked_ticket_id::text, t.created_at
		FROM kds_tickets t
		LEFT JOIN orders o ON o.id = t.order_id
		LEFT JOIN floor_tables ft ON ft.id = o.table_id
		WHERE 1=1`
	args := []interface{}{}
	argIdx := 1

	if station != "" {
		query += ` AND t.station = $` + itoa(argIdx)
		args = append(args, station)
		argIdx++
	}
	if status != "" {
		query += ` AND t.status = $` + itoa(argIdx)
		args = append(args, status)
		argIdx++
	} else {
		// No explicit filter: hide terminal tickets. A ticket marked 'served'
		// (Completed on the KDS) drops off the board and never reappears on
		// a poll.
		query += ` AND t.status <> 'served'`
	}

	query += ` ORDER BY t.created_at ASC`

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tickets []model.KDSTicket
	for rows.Next() {
		var t model.KDSTicket
		if err := rows.Scan(&t.ID, &t.OrderID, &t.Type, &t.Table, &t.Tag, &t.Station, &t.Status, &t.AIPhone, &t.Allergy, &t.Fired, &t.LinkedTicketID, &t.CreatedAt); err != nil {
			return nil, err
		}
		items, _ := r.getOrderItems(ctx, t.OrderID)
		t.Items = items
		tickets = append(tickets, t)
	}
	return tickets, nil
}

func (r *TicketRepo) getOrderItems(ctx context.Context, orderID string) ([]model.OrderItem, error) {
	rows, err := r.db.Query(ctx,
		`SELECT id, order_id, menu_item_id::text, name, qty, price, COALESCE(notes, '') FROM order_items WHERE order_id = $1`, orderID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []model.OrderItem
	for rows.Next() {
		var i model.OrderItem
		if err := rows.Scan(&i.ID, &i.OrderID, &i.MenuItemID, &i.Name, &i.Qty, &i.Price, &i.Notes); err != nil {
			return nil, err
		}
		items = append(items, i)
	}
	return items, nil
}

func (r *TicketRepo) GetByID(ctx context.Context, id string) (*model.KDSTicket, error) {
	var t model.KDSTicket
	err := r.db.QueryRow(ctx,
		`SELECT t.id, t.order_id, COALESCE(o.type, 'dine-in'), COALESCE(ft.name, ''), COALESCE(t.tag,''), t.station, t.status, t.ai_phone, COALESCE(t.allergy,''), t.fired, t.linked_ticket_id::text, t.created_at
		FROM kds_tickets t
		LEFT JOIN orders o ON o.id = t.order_id
		LEFT JOIN floor_tables ft ON ft.id = o.table_id
		WHERE t.id = $1`, id,
	).Scan(&t.ID, &t.OrderID, &t.Type, &t.Table, &t.Tag, &t.Station, &t.Status, &t.AIPhone, &t.Allergy, &t.Fired, &t.LinkedTicketID, &t.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func (r *TicketRepo) Create(ctx context.Context, t *model.KDSTicket) error {
	err := r.db.QueryRow(ctx,
		`INSERT INTO kds_tickets (order_id, tag, station, status, ai_phone, allergy, fired) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, created_at`,
		t.OrderID, t.Tag, t.Station, t.Status, t.AIPhone, t.Allergy, t.Fired,
	).Scan(&t.ID, &t.CreatedAt)
	return err
}

func (r *TicketRepo) UpdateStatus(ctx context.Context, id, status string) error {
	_, err := r.db.Exec(ctx, `UPDATE kds_tickets SET status = $1 WHERE id = $2`, status, id)
	return err
}

func (r *TicketRepo) Fire(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `UPDATE kds_tickets SET fired = true WHERE id = $1`, id)
	return err
}
