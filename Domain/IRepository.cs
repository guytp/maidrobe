using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Domain
{
    public interface IRepository<T> where T : BaseDataObject
    {
        Task<T> GetByIdAsync(Guid id);
        Task<T> CreateAsync(T entity);
        Task InsertAsync(IEnumerable<T> entities);
        Task<T> UpdateAsync(T entity);
        Task DeleteAsync(Guid id);
        Task PatchAsync(Guid id, string[] propertyNames);
    }
}